/**
 * Debug script v2: Save extracted EPUB covers to temp files for visual verification.
 * Usage: nvm use 22 && node scripts/debug-epub-cover-v2.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import JSZip from 'jszip';

function extractAttr(attrsStr, name) {
  const m = attrsStr.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) ??
           attrsStr.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`));
  return m?.[1];
}

function resolvePath(base, href) {
  if (href.includes('://')) return href;
  if (href.startsWith('/')) return href.slice(1);
  const combined = base + href;
  const parts = combined.split('/');
  const result = [];
  for (const part of parts) {
    if (part === '..') result.pop();
    else if (part !== '.' && part !== '') result.push(part);
  }
  return result.join('/');
}

async function extractCover(zip, opfPath) {
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const opfFile = zip.file(opfPath);
  if (!opfFile) return { error: 'OPF not found', foundVia: 'none' };
  const opfXml = await opfFile.async('text');

  // Build manifest
  const manifest = new Map();
  const itemRegex = /<item\b([^>]*)>/g;
  let m;
  while ((m = itemRegex.exec(opfXml)) !== null) {
    const id = extractAttr(m[1], 'id');
    const href = extractAttr(m[1], 'href');
    const mediaType = extractAttr(m[1], 'media-type');
    const props = extractAttr(m[1], 'properties');
    if (id && href) manifest.set(id, { id, href, mediaType, props });
  }

  let coverHref = null, coverItemId = null, foundVia = 'none';

  // EPUB 3
  const itemRegex2 = /<item\b([^>]*)>/g;
  let ci;
  while ((ci = itemRegex2.exec(opfXml))) {
    const props = extractAttr(ci[1], 'properties');
    if (props?.split(/\s+/).includes('cover-image')) {
      coverItemId = extractAttr(ci[1], 'id') ?? null;
      coverHref = extractAttr(ci[1], 'href') ?? null;
      foundVia = 'EPUB3:properties=cover-image';
      break;
    }
  }

  // EPUB 2
  if (!coverHref) {
    const metaRegex = /<meta\b([^>]*)>/g;
    let mm;
    while ((mm = metaRegex.exec(opfXml))) {
      const metaName = extractAttr(mm[1], 'name');
      const metaProp = extractAttr(mm[1], 'property');
      if (metaName === 'cover' || metaProp === 'cover') {
        const coverId = extractAttr(mm[1], 'content');
        if (coverId) {
          coverItemId = coverId;
          foundVia = 'EPUB2:meta name=cover';
          const itemRegex3 = /<item\b([^>]*)>/g;
          let im3;
          while ((im3 = itemRegex3.exec(opfXml))) {
            if (extractAttr(im3[1], 'id') === coverId) {
              coverHref = extractAttr(im3[1], 'href') || null;
              break;
            }
          }
        }
        break;
      }
    }
  }

  if (!coverHref) {
    // Check for <guide><reference type="cover">
    const guideMatch = opfXml.match(/<guide[^>]*>([\s\S]*?)<\/guide>/);
    if (guideMatch) {
      const refMatch = guideMatch[1].match(/<reference\b[^>]*type="cover"[^>]*href="([^"]+)"/);
      if (refMatch) {
        foundVia = 'guide reference type=cover';
        // This references an HTML page, not an image — skip
        return { error: `Guide cover reference (${refMatch[1]}) — not an image`, foundVia };
      }
    }
    // Look for items with "cover" in id
    for (const [id, item] of manifest) {
      if (id.toLowerCase().includes('cover') && item.mediaType?.startsWith('image/')) {
        coverItemId = id;
        coverHref = item.href;
        foundVia = 'heuristic:id contains cover';
        break;
      }
    }
  }

  if (!coverHref) return { error: 'No cover found in metadata', foundVia: 'none' };

  const resolvedPath = resolvePath(opfDir, coverHref);
  const coverFile = zip.file(resolvedPath);
  if (!coverFile) {
    // Try alternate paths
    const altPaths = [coverHref, opfDir + coverHref, coverHref.replace(opfDir, '')];
    for (const alt of altPaths) {
      if (!alt || alt === resolvedPath) continue;
      const f = zip.file(alt);
      if (f) return extractAndSave(f, coverItemId, manifest, foundVia, alt);
    }
    return { error: `Cover file not found at ${resolvedPath}`, foundVia };
  }

  return extractAndSave(coverFile, coverItemId, manifest, foundVia, resolvedPath);
}

async function extractAndSave(coverFile, coverItemId, manifest, foundVia, resolvedPath) {
  const coverItem = coverItemId ? manifest.get(coverItemId) : undefined;
  const mimeType = coverItem?.mediaType ?? 'image/jpeg';
  const base64 = await coverFile.async('base64');
  const ext = mimeType.split('/')[1] || 'jpg';
  
  return {
    foundVia,
    resolvedPath,
    mimeType,
    base64Length: base64.length,
    sizeKB: (base64.length * 0.75 / 1024).toFixed(1),
    base64,
    ext,
  };
}

function findEpubFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      try {
        const s = statSync(fullPath);
        if (s.isFile() && extname(entry).toLowerCase() === '.epub') {
          results.push(fullPath);
        } else if (s.isDirectory()) {
          results.push(...findEpubFiles(fullPath));
        }
      } catch {}
    }
  } catch {}
  return results;
}

async function main() {
  const epubDir = join(process.cwd(), 'tmp/testing-assets/epub');
  const outputDir = join(process.cwd(), 'tmp/debug-covers');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const epubFiles = findEpubFiles(epubDir);
  console.log(`📚 Found ${epubFiles.length} EPUB files\n`);

  let successCount = 0;
  let failCount = 0;

  for (const epubPath of epubFiles.sort()) {
    const name = epubPath.split('/').pop().replace('.epub', '');
    console.log(`📖 ${name}`);
    
    try {
      const buffer = readFileSync(epubPath);
      const zip = await JSZip.loadAsync(buffer);
      
      const containerFile = zip.file('META-INF/container.xml');
      if (!containerFile) { console.log(`  ❌ No container.xml`); failCount++; continue; }
      
      const containerXml = await containerFile.async('text');
      const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
      if (!rootfileMatch) { console.log(`  ❌ No rootfile`); failCount++; continue; }

      const result = await extractCover(zip, rootfileMatch[1]);
      
      if (result.error) {
        console.log(`  ⚠️  ${result.error} (via: ${result.foundVia})`);
        failCount++;
      } else if (result.base64) {
        // Save to file
        const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff\-]/g, '_').substring(0, 60);
        const outPath = join(outputDir, `${safeName}.${result.ext}`);
        const buffer = Buffer.from(result.base64, 'base64');
        writeFileSync(outPath, buffer);
        console.log(`  ✅ Saved: ${outPath}`);
        console.log(`     Via: ${result.foundVia}, MIME: ${result.mimeType}, Size: ${result.sizeKB} KB`);
        successCount++;
      }
    } catch (e) {
      console.log(`  ❌ ERROR: ${e.message}`);
      failCount++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ ${successCount} covers extracted, ❌ ${failCount} failures`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`\nOpen with: open ${outputDir}`);
}

main().catch(console.error);
