import { LayoutGrid, Apple, Pill, BookOpen, Puzzle, Baby, Tag } from 'lucide-react';
import type { ElementType } from 'react';

export interface CategoryDef {
  id: string;
  label: string;
  Icon: ElementType;
  color: string; // tailwind badge classes
}

export const CATEGORIES: CategoryDef[] = [
  { id: '전체',          label: '전체',          Icon: LayoutGrid, color: 'bg-chart-1/20 text-chart-1' },
  { id: '식품',          label: '식품',          Icon: Apple,      color: 'bg-chart-2/20 text-chart-2' },
  { id: '영양제',        label: '영양제',        Icon: Pill,       color: 'bg-chart-3/20 text-chart-3' },
  { id: '도서',          label: '도서',          Icon: BookOpen,   color: 'bg-chart-4/20 text-chart-4' },
  { id: '교구',          label: '교구',          Icon: Puzzle,     color: 'bg-chart-5/20 text-chart-5' },
  { id: '육아 서포트 템', label: '육아 서포트 템', Icon: Baby,       color: 'bg-primary/20 text-primary' },
  { id: '기타',          label: '기타',          Icon: Tag,        color: 'bg-secondary text-secondary-foreground' },
];

/** '전체' 제외 — Admin/Report 드롭다운용 */
export const DEAL_CATEGORIES = CATEGORIES.filter((c) => c.id !== '전체');

export function getCategoryDef(id: string): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}