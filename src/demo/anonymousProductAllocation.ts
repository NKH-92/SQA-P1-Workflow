export type DemoProductAllocationRow = {
  category: string
  productName: string
  assigneeName: string
  companyName: string
}

export const demoProductAllocationRows = [
  { category: '자사', productName: '자사제품 A', assigneeName: '파트원 A', companyName: '자사' },
  { category: '자사', productName: '자사제품 B', assigneeName: '파트원 A', companyName: '자사' },
  { category: '자사', productName: '자사제품 C', assigneeName: '파트원 B', companyName: '자사' },
  { category: '위탁', productName: '위탁제품 D', assigneeName: '파트원 B', companyName: '위탁사 A' },
  { category: '위탁', productName: '위탁제품 E', assigneeName: '', companyName: '위탁사 B' },
] as const satisfies readonly DemoProductAllocationRow[]
