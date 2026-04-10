/**
 * Migration: backfill brand + instagramUrl for specific deal documents
 *
 * Target deals:
 *   - xsz9XBrJ45c8izst5cNo
 *   - y0IyDldJVjQ4cYelG697
 *   - SrWBv2mD9Bxu0SSmABJv
 *
 * Strategy:
 *   1. Read each deal document to inspect current sourceUrl / reporterId
 *   2. Query influencers collection to find matching influencer by inpockUrl
 *   3. Derive brand (inpock username) and instagramUrl from influencer doc
 *   4. If not found automatically, fall back to MANUAL_OVERRIDES below
 *
 * Usage:
 *   node scripts/migrate-deals-brand-instagram.js [--dry-run]
 *
 * Requirements:
 *   GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account JSON
 *   OR firebase-admin initialized via application default credentials
 *
 *   npm install firebase-admin   (if not already installed globally)
 */

'use strict';

const admin = require('firebase-admin');

// ── Manual overrides ──────────────────────────────────────────────────────────
// Fill these in if automatic lookup fails.
// Leave as null to attempt automatic lookup from the influencers collection.
//
// brand:        inpock username (e.g. "chaewon_mom")
// instagramUrl: full URL (e.g. "https://www.instagram.com/chaewon_mom/")
// instagramId:  username only (e.g. "chaewon_mom") — derived from instagramUrl if omitted

const MANUAL_OVERRIDES = {
  xsz9XBrJ45c8izst5cNo: { brand: null, instagramUrl: null },
  y0IyDldJVjQ4cYelG697: { brand: null, instagramUrl: null },
  SrWBv2mD9Bxu0SSmABJv: { brand: null, instagramUrl: null },
};

// ─────────────────────────────────────────────────────────────────────────────

const DEAL_IDS = Object.keys(MANUAL_OVERRIDES);
const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  // Initialize firebase-admin (uses GOOGLE_APPLICATION_CREDENTIALS or ADC)
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  console.log(`\n꼬마발자국 — deals brand/instagramUrl 마이그레이션`);
  console.log(`DRY RUN: ${DRY_RUN ? 'YES (no writes)' : 'NO (will write)'}\n`);

  // Load all influencers once for lookup
  const influencersSnap = await db.collection('influencers').get();
  const influencers = influencersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  for (const dealId of DEAL_IDS) {
    console.log(`\n─── Deal: ${dealId} ───`);

    const dealRef = db.collection('deals').doc(dealId);
    const dealSnap = await dealRef.get();

    if (!dealSnap.exists) {
      console.log(`  ⚠️  문서를 찾을 수 없습니다. 건너뜁니다.`);
      continue;
    }

    const deal = dealSnap.data();
    console.log(`  현재 brand:        "${deal.brand ?? ''}"`);
    console.log(`  현재 instagramUrl: "${deal.instagramUrl ?? ''}"`);
    console.log(`  sourceUrl:         "${deal.sourceUrl ?? ''}"`);

    const override = MANUAL_OVERRIDES[dealId];
    let newBrand = override.brand ?? deal.brand ?? '';
    let newInstagramUrl = override.instagramUrl ?? deal.instagramUrl ?? '';

    // Auto-lookup: try to find influencer whose inpockUrl username matches deal.brand
    if ((!newBrand || !newInstagramUrl) && deal.brand) {
      const match = influencers.find(
        (inf) =>
          typeof inf.inpockUrl === 'string' &&
          inf.inpockUrl.endsWith(`/${deal.brand}`),
      );
      if (match) {
        const instagramId = match.instagramId ?? '';
        newBrand = newBrand || deal.brand;
        newInstagramUrl =
          newInstagramUrl ||
          match.instagramUrl ||
          (instagramId ? `https://www.instagram.com/${instagramId}/` : '');
        console.log(`  influencer 자동 매칭: ${match.id} (inpockUrl: ${match.inpockUrl})`);
      }
    }

    // Derive instagramId from instagramUrl
    const newInstagramId = newInstagramUrl
      ? newInstagramUrl.replace(/\/$/, '').split('/').filter(Boolean).pop() ?? ''
      : deal.instagramId ?? '';

    const update = {};
    if (newBrand && newBrand !== (deal.brand ?? '')) {
      update.brand = newBrand;
    }
    if (newInstagramUrl && newInstagramUrl !== (deal.instagramUrl ?? '')) {
      update.instagramUrl = newInstagramUrl;
    }
    if (newInstagramId && newInstagramId !== (deal.instagramId ?? '')) {
      update.instagramId = newInstagramId;
    }

    if (Object.keys(update).length === 0) {
      console.log(`  ℹ️  업데이트할 내용이 없거나 MANUAL_OVERRIDES가 비어 있습니다.`);
      console.log(`     MANUAL_OVERRIDES에 brand/instagramUrl을 직접 입력해 주세요.`);
      continue;
    }

    console.log(`  → 업데이트 예정:`, update);

    if (!DRY_RUN) {
      await dealRef.update(update);
      console.log(`  ✅ 업데이트 완료`);
    } else {
      console.log(`  [DRY RUN] 실제 쓰기는 수행하지 않았습니다.`);
    }
  }

  console.log(`\n마이그레이션 완료.\n`);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});