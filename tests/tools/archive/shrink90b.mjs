import sharp from 'sharp';
import fs from 'node:fs';
const dir = 'C:/Users/33329/Documents/Misc/对话成果/2026-11-01_第90轮第二批_时间轴整年历史/对照图';
const long = `${dir}/90b-04-时间轴整页缩略.png`;
const before = fs.statSync(long).size;
await sharp(long).resize({ width: 640 }).jpeg({ quality: 86, mozjpeg: true }).toFile(`${dir}/90b-04-时间轴整页缩略.jpg`);
fs.unlinkSync(long);
console.log(`整页缩略: ${(before / 1048576).toFixed(1)}MB -> ${(fs.statSync(`${dir}/90b-04-时间轴整页缩略.jpg`).size / 1024).toFixed(0)}KB`);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.png'))) {
  const p = `${dir}/${f}`;
  const s = fs.statSync(p).size;
  if (s > 1200 * 1024) {
    await sharp(p).resize({ width: 1300 }).jpeg({ quality: 88, mozjpeg: true }).toFile(p.replace(/\.png$/, '.jpg'));
    fs.unlinkSync(p);
    console.log(`${f}: ${(s / 1048576).toFixed(1)}MB -> ${(fs.statSync(p.replace(/\.png$/, '.jpg')).size / 1024).toFixed(0)}KB`);
  }
}
