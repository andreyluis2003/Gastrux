import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): invoice OCR needed a key never set; the NF-e XML import covers purchase notes
export default function OldInvoiceOcrPage() {
  redirect('/admin/nfe-import');
}
