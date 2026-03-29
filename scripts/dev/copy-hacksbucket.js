import { createClient } from "@supabase/supabase-js";

const SRC_URL = process.env.SRC_URL;
const SRC_SERVICE_KEY = process.env.SRC_SERVICE_KEY;
const DEST_URL = process.env.DEST_URL;
const DEST_SERVICE_KEY = process.env.DEST_SERVICE_KEY;

const BUCKET = "hacksbucket";

if (!SRC_URL || !SRC_SERVICE_KEY || !DEST_URL || !DEST_SERVICE_KEY) {
  console.error("Missing env vars. Set: SRC_URL, SRC_SERVICE_KEY, DEST_URL, DEST_SERVICE_KEY");
  process.exit(1);
}

const src = createClient(SRC_URL, SRC_SERVICE_KEY, { auth: { persistSession: false } });
const dest = createClient(DEST_URL, DEST_SERVICE_KEY, { auth: { persistSession: false } });

// Recursively list all files in a bucket
async function listAll(prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await src.storage.from(BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;

    if (!data || data.length === 0) break;

    for (const item of data) {
      // In Supabase Storage, folders come back without `id`, files have `id`
      if (item.id) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        out.push(fullPath);
      } else {
        const nextPrefix = prefix ? `${prefix}/${item.name}` : item.name;
        const children = await listAll(nextPrefix);
        out.push(...children);
      }
    }

    offset += data.length;
    if (data.length < limit) break;
  }

  return out;
}

async function main() {
  console.log(`Listing SOURCE bucket "${BUCKET}"...`);
  const files = await listAll("");
  console.log(`Found ${files.length} files.`);

  for (let i = 0; i < files.length; i++) {
    const path = files[i];

    const { data: blob, error: dlErr } = await src.storage.from(BUCKET).download(path);
    if (dlErr) {
      console.error(`Download failed: ${path} :: ${dlErr.message}`);
      continue;
    }

    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);

    const { error: upErr } = await dest.storage.from(BUCKET).upload(path, bytes, {
      upsert: true,
      contentType: blob.type || undefined,
    });

    if (upErr) {
      console.error(`Upload failed: ${path} :: ${upErr.message}`);
      continue;
    }

    if ((i + 1) % 50 === 0) console.log(`Copied ${i + 1}/${files.length}`);
  }

  console.log("Done: hacksbucket copied SOURCE → DEST");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
