import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// ── Env vars (set via firebase functions:secrets:set or .env.functions) ──────
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID ?? '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET ?? '';
const NAVER_SHOP_URL = 'https://openapi.naver.com/v1/search/shop.json';

// FCM tokens per sendEachForMulticast batch ceiling
const FCM_BATCH_SIZE = 500;

// ── Shared types ──────────────────────────────────────────────────────────────

interface NaverProduct {
  title: string;
  link: string;
  image: string;
  lprice: string;
  mallName: string;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Strip HTML tags injected by Naver Shopping API into product titles.
 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

/**
 * Call Naver Shopping Search API and return normalized product list.
 * Returns [] on any failure — background jobs must never throw over API errors.
 */
async function fetchNaverProducts(query: string, limit = 3): Promise<NaverProduct[]> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    logger.warn('[naver] credentials not set — skipping product fetch');
    return [];
  }
  try {
    const url = new URL(NAVER_SHOP_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(limit));
    url.searchParams.set('sort', 'sim');

    const resp = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
    });

    if (!resp.ok) {
      logger.warn(`[naver] API error: HTTP ${resp.status}`);
      return [];
    }

    const body = await resp.json() as { items: Array<Record<string, string>> };
    return body.items.map((item) => ({
      title: stripHtml(item['title'] ?? ''),
      link: item['link'] ?? '',
      image: item['image'] ?? '',
      lprice: item['lprice'] ?? '0',
      mallName: item['mallName'] ?? '',
    }));
  } catch (err) {
    logger.error('[naver] fetch error:', err);
    return [];
  }
}

/**
 * Send FCM to a list of tokens in batches of FCM_BATCH_SIZE.
 * Silently removes invalid/expired tokens from Firestore.
 */
async function sendFcmBatch(
  tokens: Array<{ token: string; userId: string }>,
  notification: { title: string; body: string },
  data: Record<string, string>,
): Promise<void> {
  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
    const message: MulticastMessage = {
      tokens: batch.map((t) => t.token),
      notification,
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    };

    const result = await messaging.sendEachForMulticast(message);

    // Clean up invalid tokens so future sends don't waste quota
    const invalidUserIds: string[] = [];
    result.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code ?? '';
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalidUserIds.push(batch[idx].userId);
        }
      }
    });

    if (invalidUserIds.length > 0) {
      const fbBatch = db.batch();
      for (const uid of invalidUserIds) {
        fbBatch.update(db.collection('users').doc(uid), { fcmToken: FieldValue.delete() });
      }
      await fbBatch.commit();
      logger.info(`[fcm] cleared ${invalidUserIds.length} invalid tokens`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Scheduled alarm sender — every minute
// ─────────────────────────────────────────────────────────────────────────────

export const sendAlarmNotifications = onSchedule(
  { schedule: '* * * * *', timeZone: 'Asia/Seoul', memory: '256MiB' },
  async () => {
    const now = Timestamp.now();
    const tenMinutesLater = Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000);

    // All alarms not yet notified
    const alarmsSnap = await db
      .collection('alarms')
      .where('notifiedAt', '==', null)
      .get();

    if (alarmsSnap.empty) return;

    // Collect unique deal IDs so we can batch-read deals
    const dealIds = [...new Set(alarmsSnap.docs.map((d) => d.data()['dealId'] as string))];
    const dealRefs = dealIds.map((id) => db.collection('deals').doc(id));
    const dealSnaps = dealRefs.length > 0 ? await db.getAll(...dealRefs) : [];

    const dealMap = new Map<string, { productName: string; startAt: Timestamp }>();
    for (const snap of dealSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      dealMap.set(snap.id, {
        productName: data['productName'] as string,
        startAt: data['startAt'] as Timestamp,
      });
    }

    // Collect alarms that fire within the next 10 minutes
    const eligibleAlarms = alarmsSnap.docs.filter((alarmDoc) => {
      const dealId = alarmDoc.data()['dealId'] as string;
      const deal = dealMap.get(dealId);
      if (!deal) return false;
      const { startAt } = deal;
      // Fire if startAt is between now and now+10min
      return startAt.toMillis() >= now.toMillis() && startAt.toMillis() <= tenMinutesLater.toMillis();
    });

    if (eligibleAlarms.length === 0) return;

    // Group by userId so we can fetch tokens in one pass
    const userIds = [...new Set(eligibleAlarms.map((d) => d.data()['userId'] as string))];
    const userSnaps = await db.getAll(...userIds.map((uid) => db.collection('users').doc(uid)));

    const tokenByUser = new Map<string, string>();
    for (const snap of userSnaps) {
      if (!snap.exists) continue;
      const token = snap.data()!['fcmToken'] as string | undefined;
      if (token) tokenByUser.set(snap.id, token);
    }

    // Build per-alarm notification and mark notified
    const writeBatch = db.batch();
    const sends: Array<{
      tokens: Array<{ token: string; userId: string }>;
      title: string;
      body: string;
      data: Record<string, string>;
    }> = [];

    for (const alarmDoc of eligibleAlarms) {
      const { userId, dealId } = alarmDoc.data() as { userId: string; dealId: string };
      const token = tokenByUser.get(userId);
      if (!token) continue;

      const deal = dealMap.get(dealId)!;
      const minutesLeft = Math.round((deal.startAt.toMillis() - now.toMillis()) / 60_000);
      const urgency = minutesLeft <= 1 ? '지금 바로' : `${minutesLeft}분 후`;

      sends.push({
        tokens: [{ token, userId }],
        title: '공구 시작 알림',
        body: `${deal.productName} 공구가 ${urgency} 시작됩니다!`,
        data: { dealId, type: 'alarm' },
      });

      writeBatch.update(alarmDoc.ref, { notifiedAt: FieldValue.serverTimestamp() });
    }

    // Send notifications then persist notifiedAt updates
    for (const send of sends) {
      await sendFcmBatch(send.tokens, { title: send.title, body: send.body }, send.data);
    }
    await writeBatch.commit();

    logger.info(`[alarmSender] sent ${sends.length} alarm notification(s)`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Keyword match notifier — fires when a deal is approved
// ─────────────────────────────────────────────────────────────────────────────

export const notifyKeywordMatches = onDocumentWritten(
  { document: 'deals/{dealId}', memory: '256MiB' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // Only act when status flips to 'approved'
    if (!after || after['status'] !== 'approved') return;
    if (before?.['status'] === 'approved') return; // no change

    const dealId = event.params['dealId'];
    const productName = (after['productName'] as string ?? '').toLowerCase();
    const category = (after['category'] as string ?? '').toLowerCase();

    if (!productName) return;

    // Fetch all users who have consented to notifications and have a token
    const usersSnap = await db
      .collection('users')
      .where('notificationConsent', '==', true)
      .get();

    if (usersSnap.empty) return;

    interface Match {
      token: string;
      userId: string;
      matchedKeyword: string;
    }
    const matches: Match[] = [];

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const token = data['fcmToken'] as string | undefined;
      if (!token) continue;

      const keywords = (data['keywords'] as string[] | undefined) ?? [];
      if (keywords.length === 0) continue;

      // Match if any keyword appears in productName or equals category (case-insensitive)
      const matchedKeyword = keywords.find((kw) => {
        const k = kw.toLowerCase();
        return productName.includes(k) || category === k || category.includes(k);
      });

      if (matchedKeyword) {
        matches.push({ token, userId: userDoc.id, matchedKeyword });
      }
    }

    if (matches.length === 0) return;

    // Group by matched keyword for a natural notification body
    const grouped = new Map<string, Array<{ token: string; userId: string }>>();
    for (const m of matches) {
      const list = grouped.get(m.matchedKeyword) ?? [];
      list.push({ token: m.token, userId: m.userId });
      grouped.set(m.matchedKeyword, list);
    }

    for (const [keyword, tokens] of grouped) {
      await sendFcmBatch(
        tokens,
        {
          title: '관심 공구 등록',
          body: `'${keyword}' 관련 공구가 등록됐어요: ${after['productName']}`,
        },
        { dealId, type: 'keyword' },
      );
    }

    logger.info(`[keywordNotifier] deal ${dealId} → notified ${matches.length} user(s)`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Inactive token cleanup — daily at 3am KST
// ─────────────────────────────────────────────────────────────────────────────

export const cleanupInactiveTokens = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'Asia/Seoul', memory: '256MiB' },
  async () => {
    const sixMonthsAgo = Timestamp.fromMillis(
      Date.now() - 6 * 30 * 24 * 60 * 60 * 1000
    );

    const staleSnap = await db
      .collection('users')
      .where('lastActiveAt', '<', sixMonthsAgo)
      .get();

    if (staleSnap.empty) {
      logger.info('[cleanup] no stale users found');
      return;
    }

    // Delete only the fcmToken field, not the whole document
    const CHUNK = 500; // Firestore batch limit
    let cleaned = 0;

    for (let i = 0; i < staleSnap.docs.length; i += CHUNK) {
      const batch = db.batch();
      for (const doc of staleSnap.docs.slice(i, i + CHUNK)) {
        if (doc.data()['fcmToken']) {
          batch.update(doc.ref, { fcmToken: FieldValue.delete() });
          cleaned++;
        }
      }
      await batch.commit();
    }

    logger.info(`[cleanup] cleared fcmToken from ${cleaned} inactive user(s)`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Inpock scraper — daily at 9am KST
// ─────────────────────────────────────────────────────────────────────────────

interface InpockBlock {
  title?: string;
  image?: string;
  url?: string;
  open_at?: string;
  open_until?: string;
  block_type?: string;
}

interface SrookpayMeta {
  ogTitle: string;
  ogImage: string;
  price: number;
  originalPrice: number;
}

/**
 * Follow redirect chain on short URLs (e.g. srok.kr) to get the final URL.
 * Returns null if the redirect target is not a srookpay domain.
 */
async function resolveRedirect(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    const finalUrl = resp.url;
    if (finalUrl.includes('srookpay.com') || finalUrl.includes('srok.kr')) {
      return finalUrl;
    }
    return finalUrl; // accept any final URL
  } catch {
    return null;
  }
}

/**
 * Parse og:title, og:image, price, and original price from a srookpay product page.
 */
async function fetchSrookpayMeta(url: string): Promise<SrookpayMeta | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KkomaBaljaguk/1.0)' },
    });
    if (!resp.ok) return null;

    const html = await resp.text();

    // og:title
    const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const ogTitle = titleMatch?.[1]?.trim() ?? '';

    // og:image
    const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    let ogImage = imageMatch?.[1]?.trim() ?? '';
    if (ogImage.startsWith('//')) ogImage = 'https:' + ogImage;

    // Price — look for patterns like "79,000원" or data-price attributes
    const priceMatch = html.match(/data-price=["']?(\d[\d,]+)["']?/i)
      ?? html.match(/["']price["'][^>]*>\s*(\d[\d,]+)\s*원/i)
      ?? html.match(/class=["'][^"']*(?:sale|discount|deal)[^"']*["'][^>]*>\s*(\d[\d,]+)/i)
      ?? html.match(/(\d[\d,]+)\s*원/);
    const price = priceMatch
      ? parseInt(priceMatch[1].replace(/,/g, ''), 10)
      : 0;

    // Original price — try to find a second (higher) price
    const allPrices = [...html.matchAll(/(\d[\d,]+)\s*원/g)]
      .map((m) => parseInt(m[1].replace(/,/g, ''), 10))
      .filter((p) => p > 0);
    const originalPrice = allPrices.find((p) => p > price) ?? 0;

    if (!ogTitle) return null;
    return { ogTitle, ogImage, price, originalPrice };
  } catch {
    return null;
  }
}

/**
 * Fetch and parse an inpock page, returning deal blocks after "공구OPEN".
 */
async function fetchInpockBlocks(inpockUrl: string): Promise<InpockBlock[]> {
  const resp = await fetch(inpockUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KkomaBaljaguk/1.0)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const html = await resp.text();

  // Extract __NEXT_DATA__ JSON from <script id="__NEXT_DATA__">
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('__NEXT_DATA__ not found');

  const nextData = JSON.parse(match[1]);
  const blocks: InpockBlock[] = nextData?.props?.pageProps?.blocks ?? [];

  // Find the index of the "공구OPEN" label block
  const openIdx = blocks.findIndex(
    (b) => b.block_type === 'label' && b.title?.includes('공구') && b.title?.includes('OPEN'),
  );
  if (openIdx === -1) return [];

  // Return only link blocks that follow the 공구OPEN label
  const result: InpockBlock[] = [];
  for (let i = openIdx + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.block_type === 'label') break; // next section starts
    if (b.block_type === 'link' && b.url) result.push(b);
  }
  return result;
}

export const scrapeInpockDeals = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Seoul', memory: '512MiB', timeoutSeconds: 540 },
  async () => {
    // Fetch all active influencers
    const influencersSnap = await db
      .collection('influencers')
      .where('active', '==', true)
      .get();

    if (influencersSnap.empty) {
      logger.info('[inpock] no active influencers');
      return;
    }

    let totalNew = 0;

    for (const infDoc of influencersSnap.docs) {
      const inf = infDoc.data() as {
        inpockUrl: string;
        name: string;
        instagramId: string;
      };

      try {
        const blocks = await fetchInpockBlocks(inf.inpockUrl);
        logger.info(`[inpock] ${inf.name}: ${blocks.length} deal block(s)`);

        for (const block of blocks) {
          try {
            // Resolve short URL to final srookpay URL
            const finalUrl = await resolveRedirect(block.url!);
            if (!finalUrl) {
              logger.warn(`[inpock] ${inf.name}: redirect failed for ${block.url}`);
              continue;
            }

            // Fetch og metadata from srookpay page
            const meta = await fetchSrookpayMeta(finalUrl);
            if (!meta?.ogTitle) {
              logger.warn(`[inpock] ${inf.name}: no meta for ${finalUrl}`);
              continue;
            }

            // Duplicate check by sourceUrl OR productName+influencer
            const dupSnap = await db
              .collection('deals')
              .where('sourceUrl', '==', finalUrl)
              .limit(1)
              .get();
            if (!dupSnap.empty) continue;

            const dupByName = await db
              .collection('deals')
              .where('productName', '==', meta.ogTitle)
              .where('brand', '==', inf.name)
              .limit(1)
              .get();
            if (!dupByName.empty) continue;

            // Parse timestamps
            const startAt = block.open_at
              ? Timestamp.fromDate(new Date(block.open_at))
              : Timestamp.now();
            const endAt = block.open_until
              ? Timestamp.fromDate(new Date(block.open_until))
              : Timestamp.fromMillis(startAt.toMillis() + 7 * 24 * 60 * 60 * 1000);

            // Save new deal as pending
            await db.collection('deals').add({
              productName: meta.ogTitle,
              brand: inf.name || inf.instagramId || '',
              category: '기타',
              startAt,
              endAt,
              price: meta.price,
              originalPrice: meta.originalPrice,
              instagramUrl: `https://www.instagram.com/${inf.instagramId}/`,
              sourceUrl: finalUrl,
              thumbnailUrl: meta.ogImage,
              oembedHtml: '',
              naverProducts: [],
              status: 'pending',
              reporterId: 'system',
              reporterRole: 'system',
              createdAt: FieldValue.serverTimestamp(),
              viewCount: 0,
            });

            totalNew++;
            logger.info(`[inpock] saved: ${meta.ogTitle}`);

            // FCM broadcast to consented users
            const usersSnap = await db
              .collection('users')
              .where('notificationConsent', '==', true)
              .get();

            const tokens = usersSnap.docs
              .map((d) => ({ token: d.data()['fcmToken'] as string, userId: d.id }))
              .filter((t) => !!t.token);

            if (tokens.length > 0) {
              await sendFcmBatch(
                tokens,
                { title: '새 공구 등록', body: `${meta.ogTitle} 공구가 시작됐어요!` },
                { type: 'new_deal' },
              );
            }
          } catch (blockErr) {
            logger.error(`[inpock] block error (${inf.name} / ${block.url}):`, blockErr);
          }
        }
      } catch (infErr) {
        logger.error(`[inpock] influencer error (${inf.name}):`, infErr);
      }

      // Update lastScrapedAt regardless of parse success
      await infDoc.ref.update({ lastScrapedAt: FieldValue.serverTimestamp() });
    }

    logger.info(`[inpock] done — ${totalNew} new deal(s) saved`);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Naver products refresh — daily at 6am KST
// ─────────────────────────────────────────────────────────────────────────────
// Calls Naver Shopping API directly (same credentials as OCR server) rather
// than routing through the OCR server's /naver-refresh HTTP endpoint, which
// would require minting a Firebase ID token inside a Cloud Function.

export const refreshNaverProducts = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'Asia/Seoul', memory: '256MiB' },
  async () => {
    const twentyFourHoursAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

    // Approved deals whose Naver products are stale (or have never been fetched)
    const dealsSnap = await db
      .collection('deals')
      .where('status', '==', 'approved')
      .where('naverUpdatedAt', '<', twentyFourHoursAgo)
      .orderBy('naverUpdatedAt', 'asc')
      .limit(100) // stay within Cloud Function timeout and Naver API quota
      .get();

    if (dealsSnap.empty) {
      logger.info('[naverRefresh] all products are fresh');
      return;
    }

    let refreshed = 0;
    let failed = 0;

    for (const dealDoc of dealsSnap.docs) {
      const productName = dealDoc.data()['productName'] as string | undefined;
      if (!productName) continue;

      const products = await fetchNaverProducts(productName);

      try {
        await dealDoc.ref.update({
          naverProducts: products,
          naverUpdatedAt: FieldValue.serverTimestamp(),
        });
        refreshed++;
      } catch (err) {
        logger.error(`[naverRefresh] failed to update deal ${dealDoc.id}:`, err);
        failed++;
      }
    }

    logger.info(`[naverRefresh] refreshed ${refreshed} deal(s), ${failed} failure(s)`);
  }
);