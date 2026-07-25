/**
 * Debug script: Test EPUB cover extraction logic against test EPUBs.
 * 
 * Usage: nvm use 22 && node scripts/debug-epub-cover.mjs
 * 
 * Replicates the exact logic from:
 *   - apps/mobile/lib/epub-parser.ts (parseOPF, resolvePath)
 *   - apps/mobile/hooks/use-epub.ts (loadFromUri cover extraction)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import JSZip from 'jszip';

// ── Replicated utilities from epub-parser.ts ──

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
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  return result.join('/');
}

function stripFragment(href) {
  const idx = href.indexOf('#');
  return idx === -1 ? href : href.slice(0, idx);
}

// ── Replicated parseOPF cover logic ──

function extractCoverFromOPF(opfXml, opfDir) {
  let coverHref = null;
  let coverItemId = null;
  let coverFoundVia = 'none';

  // Build manifest map (same as parseOPF)
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

  // EPUB 3: <item properties="cover-image">
  const itemRegex2 = /<item\b([^>]*)>/g;
  let ci;
  while ((ci = itemRegex2.exec(opfXml))) {
    const props = extractAttr(ci[1], 'properties');
    if (props && props.split(/\s+/).includes('cover-image')) {
      coverItemId = extractAttr(ci[1], 'id') ?? null;
      coverHref = extractAttr(ci[1], 'href') ?? null;
      coverFoundVia = 'EPUB3: properties="cover-image"';
      break;
    }
  }

  // EPUB 2: <meta name="cover" content="...">
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
          coverFoundVia = 'EPUB2: <meta name="cover">';
          // Look up the item by ID in manifest
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

  // Resolve cover href against OPF directory
  let resolvedCoverPath = null;
  if (coverHref) {
    resolvedCoverPath = resolvePath(opfDir, coverHref);
  }

  return {
    coverItemId,
    coverHref,
    resolvedCoverPath,
    coverFoundVia,
    manifestSize: manifest.size,
    manifestItems: [...manifest.values()].map(v => ({ id: v.id, href: v.href, mediaType: v.mediaType, isCover: v.props?.split(/\s+/).includes('cover-image') || v.id === coverItemId })),
  };
}

// ── Main debug function ──

async function debugEpub(epubPath) {
  const fileName = epubPath.split('/').pop();
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📖 ${fileName}`);
  console.log(`${'═'.repeat(80)}`);

  try {
    const buffer = readFileSync(epubPath);
    const zip = await JSZip.loadAsync(buffer);

    // 1. Find container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      console.log('  ❌ No META-INF/container.xml — not a valid EPUB');
      return;
    }
    const containerXml = await containerFile.async('text');
    console.log(`  ✅ container.xml found`);

    // 2. Find OPF path
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!rootfileMatch) {
      console.log('  ❌ No rootfile in container.xml');
      return;
    }
    const opfPath = rootfileMatch[1];
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
    console.log(`  📁 OPF path: ${opfPath}`);
    console.log(`  📁 OPF dir:  ${opfDir}`);

    // 3. Read OPF
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      console.log(`  ❌ OPF file not found: ${opfPath}`);
      return;
    }
    const opfXml = await opfFile.async('text');

    // 4. Extract cover using the same logic as parseOPF
    const coverInfo = extractCoverFromOPF(opfXml, opfDir);
    console.log(`  🔍 Cover found via: ${coverInfo.coverFoundVia}`);
    console.log(`  📋 Cover item ID:  ${coverInfo.coverItemId ?? '(none)'}`);
    console.log(`  📋 Cover href:     ${coverInfo.coverHref ?? '(none)'}`);
    console.log(`  📋 Resolved path:  ${coverInfo.resolvedCoverPath ?? '(none)'}`);
    console.log(`  📋 Manifest items: ${coverInfo.manifestSize}`);

    // 5. Try to find the cover file in the zip
    if (coverInfo.resolvedCoverPath) {
      const coverFile = zip.file(coverInfo.resolvedCoverPath);
      if (coverFile) {
        console.log(`  ✅ Cover file FOUND in zip at: ${coverInfo.resolvedCoverPath}`);
        // Try to get base64 and check size
        try {
          const base64 = await coverFile.async('base64');
          const sizeKB = (base64.length * 0.75 / 1024).toFixed(1);
          console.log(`  📏 Cover size: ~${sizeKB} KB (base64 length: ${base64.length})`);
          console.log(`  🖼️  Cover data URI prefix: data:...;base64,${base64.substring(0, 30)}...`);
        } catch (e) {
          console.log(`  ❌ Failed to read cover as base64: ${e.message}`);
        }
      } else {
        console.log(`  ❌ Cover file NOT FOUND at resolved path: ${coverInfo.resolvedCoverPath}`);
        
        // Try alternative path resolutions
        console.log(`  🔍 Trying alternative paths:`);
        const altPaths = [
          coverInfo.coverHref,                          // raw href
          coverInfo.coverHref?.replace(opfDir, ''),     // strip opfDir
          opfDir + coverInfo.coverHref,                 // double opfDir
        ];
        for (const alt of altPaths) {
          if (!alt || alt === coverInfo.resolvedCoverPath) continue;
          const f = zip.file(alt);
          console.log(`     ${alt}: ${f ? '✅ FOUND' : '❌ not found'}`);
        }

        // List all image files in the zip for debugging
        console.log(`  🔍 All image files in zip:`);
        const imageFiles = [];
        zip.forEach((relativePath, file) => {
          const ext = relativePath.toLowerCase().split('.').pop();
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            imageFiles.push(relativePath);
          }
        });
        if (imageFiles.length > 0) {
          for (const img of imageFiles.slice(0, 20)) {
            console.log(`     📷 ${img}`);
          }
          if (imageFiles.length > 20) console.log(`     ... and ${imageFiles.length - 20} more`);
        } else {
          console.log(`     (none found)`);
        }
      }
    } else {
      console.log(`  ⚠️  No cover href extracted`);
      
      // List manifest items that might be cover candidates
      console.log(`  🔍 Manifest items with image media types:`);
      for (const item of coverInfo.manifestItems) {
        if (item.mediaType?.startsWith('image/')) {
          console.log(`     id="${item.id}" href="${item.href}" mediaType="${item.mediaType}"`);
        }
      }
      
      // Check for other cover conventions
      console.log(`  🔍 Checking alternative cover conventions:`);
      
      // Check for <guide><reference type="cover">
      const guideMatch = opfXml.match(/<guide[^>]*>([\s\S]*?)<\/guide>/);
      if (guideMatch) {
        const refRegex = /<reference\b[^>]*type="cover"[^>]*href="([^"]+)"/g;
        let ref;
        while ((ref = refRegex.exec(opfXml)) !== null) {
          console.log(`     Found <reference type="cover" href="${ref[1]}">`);
        }
      }
      
      // Check for any item with id containing "cover" (case insensitive)
      for (const item of coverInfo.manifestItems) {
        if (item.id.toLowerCase().includes('cover')) {
          console.log(`     Item with "cover" in id: id="${item.id}" href="${item.href}" mediaType="${item.mediaType}"`);
        }
      }
    }

    // 6. Also check the use-epub.ts loadFromUri manifest building (uses regex differently)
    console.log(`\n  🔄 Checking loadFromUri-style manifest extraction:`);
    const manifestItems2 = new Map();
    const itemRegex2 = /<item\b([^>]*)>/g;
    let im;
    while ((im = itemRegex2.exec(opfXml)) !== null) {
      const a = im[1];
      const id = a.match(/id="([^"]+)"/)?.[1];
      const href = a.match(/href="([^"]+)"/)?.[1];
      const mediaType = a.match(/media-type="([^"]+)"/)?.[1];
      const props = a.match(/properties="([^"]+)"/)?.[1];
      if (id && href) manifestItems2.set(id, { id, href, mediaType, props });
    }
    console.log(`  📋 loadFromUri manifest size: ${manifestItems2.size}`);
    
    // Check if coverItemId from parseOPF exists in loadFromUri manifest
    if (coverInfo.coverItemId && manifestItems2.has(coverInfo.coverItemId)) {
      const item = manifestItems2.get(coverInfo.coverItemId);
      console.log(`  ✅ Cover item found in loadFromUri manifest: mediaType="${item.mediaType}"`);
    } else if (coverInfo.coverItemId) {
      console.log(`  ❌ Cover item ID "${coverInfo.coverItemId}" NOT in loadFromUri manifest`);
    }

  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}`);
    console.log(`  ${e.stack?.split('\n').slice(0, 3).join('\n  ')}`);
  }
}

// ── Find all EPUB files ──

function findEpubFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile() && extname(entry).toLowerCase() === '.epub') {
          results.push(fullPath);
        } else if (stat.isDirectory()) {
          results.push(...findEpubFiles(fullPath));
        }
      } catch {}
    }
  } catch {}
  return results;
}

// ── Run ──

async function main() {
  const epubDir = join(process.cwd(), 'tmp/testing-assets/epub');
  console.log(`🔍 Searching for EPUBs in: ${epubDir}`);
  
  const epubFiles = findEpubFiles(epubDir);
  console.log(`📚 Found ${epubFiles.length} EPUB files\n`);
  
  if (epubFiles.length === 0) {
    console.log('❌ No EPUB files found!');
    return;
  }

  for (const epubPath of epubFiles.sort()) {
    await debugEpub(epubPath);
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`✅ Done.`);
}

main().catch(console.error);
