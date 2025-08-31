const path = require("path");
const fg = require("fast-glob");
const cheerio = require("cheerio");

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"]);

function resolveUrl(u, { site, pageUrl, pagePath }) {
    if (!u) return "";
    if (/^data:/.test(u)) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("/")) return new URL(u, site).href;
    if (pagePath && u.startsWith(pagePath.replace(/^\//, ""))) {
        return new URL("/" + u, site).href;
    }
    return new URL(u, pageUrl).href;
}

function normUrl(u, { site, pageUrl, pagePath, stripQuery }) {
    let v = (u || "").trim();
    if (!v) return "";
    if (stripQuery) {
        const q = v.indexOf("?"); if (q >= 0) v = v.slice(0, q);
        const h = v.indexOf("#"); if (h >= 0) v = v.slice(0, h);
    }
    return resolveUrl(v, { site, pageUrl, pagePath });
}

function extractFromHTML(html) {
    const $ = cheerio.load(html || "");
    const found = [];
    $("img").each((_, el) => {
        const $img = $(el);
        const src = $img.attr("src") || $img.attr("data-src") || "";
        if (src) found.push(src);
        const srcset = $img.attr("srcset");
        if (srcset) {
            const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
            if (first) found.push(first);
        }
    });
    return found;
}

function extractFromButterflyGallery(html) {
    const $ = cheerio.load(html || "");
    const found = [];
    $('.gallery-container[data-type="data"] .gallery-items').each((_, el) => {
        const raw = $(el).text().trim();
        if (!raw) return;
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                for (const it of arr) {
                    if (it && typeof it.url === "string" && it.url.trim()) {
                        found.push(it.url.trim());
                    }
                }
            }
        } catch { }
    });
    return found;
}

async function listAssetsImages(assetDirAbs) {
    try {
        const patterns = ["**/*.{jpg,jpeg,png,gif,webp,avif,svg}"];
        const files = await fg(patterns, { cwd: assetDirAbs, dot: false, onlyFiles: true });
        return files.map(p => "./" + p.replace(/\\/g, "/"));
    } catch {
        return [];
    }
}

hexo.extend.generator.register("image-sitemap", async function generateImageSitemap(locals) {
    const cfg = hexo.config || {};
    const isCfg = cfg.image_sitemap || {};

    const site = (cfg.url || "").replace(/\/+$/, "") || "http://localhost:4000";

    const options = {
        target: (isCfg.target || "posts").toLowerCase(), // posts | pages | both
        include_drafts: !!isCfg.include_drafts,
        include_assets_all: !!isCfg.include_assets_all,
        max_images_per_url: isCfg.max_images_per_url ?? 1000,
        strip_query: isCfg.strip_query !== false,
        name: isCfg.name || "sitemap-image.xml",
        cover_fields: Array.isArray(isCfg.cover_fields)
            ? isCfg.cover_fields
            : ["cover", "image", "thumbnail", "banner"]
    };

    const urlsetNS = [
        'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    ].join(" ");
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${urlsetNS}>\n`;
    const footer = `</urlset>\n`;

    const pieces = [];

    const posts = locals.posts.sort("-date").toArray();
    const pages = locals.pages.toArray();
    let items;
    switch (options.target) {
        case "pages": items = pages; break;
        case "both": items = posts.concat(pages); break;
        case "posts":
        default: items = posts;
    }

    items = items.filter(p => options.include_drafts || !(p.draft || p.published === false));
    const sourceDir = path.join(this.base_dir, "source");

    for (const p of items) {
        const loc = (p.permalink && p.permalink.trim())
            ? p.permalink
            : new URL(p.path || "/", site).href;
        const pagePath = new URL(loc).pathname.replace(/\/+$/, "/");

        const fromHtml = extractFromHTML(p.content);
        const fromGallery = extractFromButterflyGallery(p.content);

        const covers = [];
        for (const k of options.cover_fields) {
            if (p && typeof p[k] === "string") covers.push(p[k]);
        }

        let assetsAll = [];
        if (p.asset_dir && options.include_assets_all) {
            const assetDirAbs = path.isAbsolute(p.asset_dir)
                ? p.asset_dir
                : path.join(sourceDir, p.asset_dir);
            const imgs = await listAssetsImages(assetDirAbs);
            assetsAll = imgs.map(rel => rel.replace(/^\.\//, ""));
        }

        let imgs = []
            .concat(covers, fromHtml, fromGallery, assetsAll)
            .filter(Boolean)
            .map(s => s.trim());

        imgs = imgs.filter(u => {
            if (/^https?:\/\//i.test(u) || u.startsWith("//")) return true;
            const ext = path.extname(u.split("?")[0].split("#")[0]).toLowerCase();
            return IMG_EXT.has(ext);
        });

        const uniq = Array.from(new Set(
            imgs.map(u => normUrl(u, {
                site,
                pageUrl: loc,
                pagePath,
                stripQuery: options.strip_query
            }))
        )).slice(0, options.max_images_per_url);

        if (uniq.length === 0) continue;

        const imageNodes = uniq
            .map(u => `    <image:image><image:loc>${u}</image:loc></image:image>`)
            .join("\n");

        pieces.push(
            `  <url>
    <loc>${loc}</loc>
${imageNodes}
  </url>`);
    }

    const xml = header + pieces.join("\n") + "\n" + footer;
    return [{ path: options.name, data: xml }];
});