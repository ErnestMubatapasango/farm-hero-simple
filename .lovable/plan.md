## In-app document preview (native approach)

### New file
`src/components/farmer/DocumentPreviewDialog.tsx` — shadcn `Dialog` that:
- Takes `{ doc, open, onOpenChange }`.
- On open, calls `supabase.storage.from("farmer-documents").createSignedUrl(doc.file_path, 300)`.
- Shows a loading spinner while the URL resolves.
- Renders:
  - `image/*` → `<img>` fit-to-container, centered, scrollable.
  - `application/pdf` → `<iframe>` filling the dialog body (browser's built-in PDF viewer handles zoom/paging/search).
  - anything else → fallback message + Download button.
- Header: file name, document-type label, status badge.
- Footer: **Download** (forces save via `a[download]`) and **Close**.
- Dialog sized `max-w-5xl` with `h-[85vh]` body.

### Edit `src/components/farmer/FarmerDocumentsSection.tsx`
- Add `const [previewDoc, setPreviewDoc] = useState<FarmerDocument | null>(null)`.
- Replace the existing **Open** button with **Preview** (Eye icon) → `setPreviewDoc(d)`.
- Keep a small **Download** icon button next to it for direct save.
- Render `<DocumentPreviewDialog doc={previewDoc} open={!!previewDoc} onOpenChange={(o)=>!o && setPreviewDoc(null)} />` once.

### Out of scope
- No DB, RLS, or storage policy changes.
- No `react-pdf` / pdf.js (kept zero-dep — native browser viewer).
- No thumbnail generation.