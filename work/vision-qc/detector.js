// Vision QC detector — runs in a Web Worker. Classical machine-vision pipeline on raw RGBA pixels:
//   1. luminance + saturation planes
//   2. 5x5 box smoothing (kills the subpixel stripe pattern and sensor noise)
//   3. band-pass: residual = smoothed - 15x15 local mean (small, sharp defects only)
//   4. robust noise sigma from the median absolute residual
//   5. threshold |residual| > k·sigma (or strong colour saturation) → binary mask
//   6. connected components, then merge fragments that sit close together
//   7. per-component features → class (scratch / dead pixel / bubble / particle)
//   8. a separate coarse pass (8x downsample) finds low-contrast, low-frequency mura
// Confidence is how far the component's contrast stands above the noise floor.

function integral(src, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}
function boxBlur(src, w, h, r) {
  const I = integral(src, w, h), out = new Float32Array(w * h), W = w + 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}
function robustSigma(res, step) {
  const a = [];
  for (let i = 0; i < res.length; i += step) a.push(Math.abs(res[i]));
  a.sort((p, q) => p - q);
  return Math.max(0.35, 1.4826 * a[a.length >> 1]);
}
function components(mask, w, h, minArea) {
  const label = new Int32Array(w * h).fill(-1), comps = [], stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = comps.length, c = { px: [], x0: w, y0: h, x1: 0, y1: 0 };
    label[i] = id; stack.push(i);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      c.px.push(p);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const nb = [p - 1, p + 1, p - w, p + w];
      for (let k = 0; k < 4; k++) {
        const q = nb[k];
        if (q < 0 || q >= w * h) continue;
        if ((k === 0 && x === 0) || (k === 1 && x === w - 1)) continue;
        if (mask[q] && label[q] < 0) { label[q] = id; stack.push(q); }
      }
    }
    if (c.px.length >= minArea) comps.push(c);
  }
  return comps;
}
// merge components whose boxes are within `gap` px (scratch fragments, bubble rims)
function mergeNear(comps, gap) {
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i], b = comps[j];
      if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
        a.px = a.px.concat(b.px);
        a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
        comps.splice(j, 1); merged = true; break outer;
      }
    }
  }
  return comps;
}
// log-scaled: faint blips stay near 0.5, clear defects approach 0.99
const conf = (z, z0 = 8, k = 0.14) => Math.max(0.5, Math.min(0.99, 0.5 + k * Math.log(Math.max(z, z0) / z0)));

function detect(rgba, w, h) {
  const n = w * h, lum = new Float32Array(n), sat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const smooth = boxBlur(lum, w, h, 2);
  const bg = boxBlur(smooth, w, h, 7);
  const res = new Float32Array(n);
  for (let i = 0; i < n; i++) res[i] = smooth[i] - bg[i];
  const sigma = robustSigma(res, 7);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = Math.abs(res[i]) > 5 * sigma || sat[i] > 110 ? 1 : 0;
  const comps = mergeNear(components(mask, w, h, 5), 6);

  const out = [];
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    if (bw > w * 0.6 || bh > h * 0.6) continue;                   // illumination edge, not a defect
    let sx = 0, sy = 0, peak = 0, bright = 0, dark = 0, smax = 0;
    for (const p of c.px) {
      sx += p % w; sy += (p / w) | 0;
      const r = res[p]; peak = Math.max(peak, Math.abs(r));
      if (r > 0) bright++; else dark++;
      smax = Math.max(smax, sat[p]);
    }
    const area = c.px.length, mx = sx / area, my = sy / area;
    let cxx = 0, cyy = 0, cxy = 0;
    for (const p of c.px) { const dx = p % w - mx, dy = ((p / w) | 0) - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
    cxx /= area; cyy /= area; cxy /= area;
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(0.25, tr / 2 - disc), elong = Math.sqrt(l1 / l2), length = 4 * Math.sqrt(l1);
    let cls;
    if (smax > 110 && bw < 60 && bh < 60) cls = "DEAD_PX";
    else if (elong > 3.2 && length > 22) cls = "SCRATCH";
    else if (bright > area * 0.2 && dark > area * 0.2 && bw > 12) cls = "BUBBLE";
    else cls = "PARTICLE";
    const z = peak / sigma;
    out.push({ cls, x: c.x0 - 4, y: c.y0 - 4, w: bw + 8, h: bh + 8, area, conf: +conf(cls === "DEAD_PX" ? Math.max(z, smax * 1.2) : z).toFixed(2),
      feat: { contrast: +(z).toFixed(1), elong: +elong.toFixed(1), area } });
  }

  // coarse pass for mura (low-frequency luminance blotches)
  const S = 8, cw = Math.floor(w / S), ch = Math.floor(h / S), coarse = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    let s = 0;
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) s += smooth[(y * S + yy) * w + x * S + xx];
    coarse[y * cw + x] = s / (S * S);
  }
  const cs = boxBlur(coarse, cw, ch, 1), cb = boxBlur(cs, cw, ch, 9), cres = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) cres[i] = cs[i] - cb[i];
  const csig = robustSigma(cres, 1), cmask = new Uint8Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) cmask[i] = cres[i] > 3.4 * csig ? 1 : 0;
  for (const c of components(cmask, cw, ch, 5)) {
    const x = c.x0 * S, y = c.y0 * S, bw = (c.x1 - c.x0 + 1) * S, bh = (c.y1 - c.y0 + 1) * S;
    if (bw > w * 0.5) continue;
    // skip if it's just the halo of an already-found sharp defect
    if (out.some(d => d.x < x + bw && x < d.x + d.w && d.y < y + bh && y < d.y + d.h && d.w * d.h > bw * bh * 0.15)) continue;
    let peak = 0;
    for (const p of c.px) peak = Math.max(peak, cres[p]);
    out.push({ cls: "MURA", x, y, w: bw, h: bh, area: c.px.length * S * S, conf: +conf(peak / csig, 4, 0.2).toFixed(2), feat: { contrast: +(peak / csig).toFixed(1), elong: 1, area: c.px.length * S * S } });
  }
  return { dets: out, sigma: +sigma.toFixed(2) };
}

self.onmessage = e => {
  const { id, w, h, buf } = e.data;
  const t0 = performance.now();
  const r = detect(new Uint8ClampedArray(buf), w, h);
  self.postMessage({ id, ...r, ms: +(performance.now() - t0).toFixed(1) });
};
