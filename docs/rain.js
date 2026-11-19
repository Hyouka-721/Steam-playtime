/* ============================================================================
 * 雨滴氛围层 · rain.js   v=1
 * ---------------------------------------------------------------------------
 * 来源：Steam Workshop「播放页雨滴」plugin-com.aoritian.playbackrain 1.0.4
 *   （Salt Player for Windows 插件，GPL-3.0，作者 AoRitian）
 *   算法源自 BetterLyrics / shadertoy.com/view/ltffzl —— 湿玻璃雨滴高度场 +
 *   镜面高光，非雪碧图 / 非视频：整幅画面由一个片元着色器逐像素算出。
 * 本文件把该 Skia RuntimeEffect GLSL 移植到 WebGL1，零依赖，供 index / watch
 *   两页共用。本文档纯装饰：fixed 全屏、pointer-events:none、不参与布局，CLS=0。
 * ---------------------------------------------------------------------------
 * 参数取自插件 preference_config.json 的默认档（0~100 归一到 0~1，角度转弧度）：
 *   speed 60→0.6 / size 100→1.0 / density 40→0.4 / lightAngle 60°→1.0472 / shadow 0→0
 * 开关状态写 localStorage['rain.enabled']（与插件键名一致），默认开；
 *   prefers-reduced-motion 下强制关并禁用按钮（与 fx.js 的既有约定一致）。
 * 浅色主题（cream）由 rain.css 的 filter:invert(1) 把白色高光翻成暗色水痕，
 *   深色（cinema / watch 页）保持原样；主题切换无需 JS 参与。
 * ========================================================================== */
(function () {
  'use strict';

  var VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = (function () { return String.raw`precision highp float;
uniform float uTime; uniform vec2 uResolution; uniform float uSpeed;
uniform float uSize; uniform float uDensity; uniform float uLightAngle; uniform float uShadow;

const float PI = 3.141592653589793;

vec4 permute(vec4 t) {
    return t * (t * 34.0 + 133.0);
}

vec3 grad(float hash) {
    vec3 cube = mod(floor(hash / vec3(1.0, 2.0, 4.0)), vec3(2.0)) * 2.0 - 1.0;
    vec3 cuboct = cube;
    int index = int(hash / 16.0);
    if (index == 0) cuboct.x = 0.0;
    else if (index == 1) cuboct.y = 0.0;
    else cuboct.z = 0.0;
    float dropType = mod(floor(hash / 8.0), 2.0);
    vec3 rhomb = (1.0 - dropType) * cube + dropType * (cuboct + cross(cube, cuboct));
    vec3 g = cuboct * 1.22474487139 + rhomb;
    g *= (1.0 - 0.042942436724648037 * dropType) * 3.5946317686139184;
    return g;
}

vec4 os2NoiseWithDerivativesPart(vec3 x) {
    vec3 b = floor(x);
    vec4 i4 = vec4(x - b, 2.5);
    vec3 v1 = b + floor(dot(i4, vec4(0.25)));
    vec3 v2 = b + vec3(1.0, 0.0, 0.0) + vec3(-1.0, 1.0, 1.0) *
        floor(dot(i4, vec4(-0.25, 0.25, 0.25, 0.35)));
    vec3 v3 = b + vec3(0.0, 1.0, 0.0) + vec3(1.0, -1.0, 1.0) *
        floor(dot(i4, vec4(0.25, -0.25, 0.25, 0.35)));
    vec3 v4 = b + vec3(0.0, 0.0, 1.0) + vec3(1.0, 1.0, -1.0) *
        floor(dot(i4, vec4(0.25, 0.25, -0.25, 0.35)));
    vec4 hashes = permute(mod(vec4(v1.x, v2.x, v3.x, v4.x), 289.0));
    hashes = permute(mod(hashes + vec4(v1.y, v2.y, v3.y, v4.y), 289.0));
    hashes = mod(permute(mod(hashes + vec4(v1.z, v2.z, v3.z, v4.z), 289.0)), 48.0);
    vec3 d1 = x - v1;
    vec3 d2 = x - v2;
    vec3 d3 = x - v3;
    vec3 d4 = x - v4;
    vec4 a = max(0.75 - vec4(dot(d1, d1), dot(d2, d2), dot(d3, d3), dot(d4, d4)), 0.0);
    vec4 aa = a * a;
    vec4 aaaa = aa * aa;
    vec3 g1 = grad(hashes.x);
    vec3 g2 = grad(hashes.y);
    vec3 g3 = grad(hashes.z);
    vec3 g4 = grad(hashes.w);
    vec4 extrapolations = vec4(dot(d1, g1), dot(d2, g2), dot(d3, g3), dot(d4, g4));
    vec4 weighted = aa * a * extrapolations;
    vec3 m1 = vec3(
        dot(vec4(d1.x, d2.x, d3.x, d4.x), weighted),
        dot(vec4(d1.y, d2.y, d3.y, d4.y), weighted),
        dot(vec4(d1.z, d2.z, d3.z, d4.z), weighted)
    );
    vec3 m2 = vec3(
        dot(vec4(g1.x, g2.x, g3.x, g4.x), aaaa),
        dot(vec4(g1.y, g2.y, g3.y, g4.y), aaaa),
        dot(vec4(g1.z, g2.z, g3.z, g4.z), aaaa)
    );
    vec3 derivative = -8.0 * m1 + m2;
    return vec4(derivative, dot(aaaa, extrapolations));
}

vec4 os2NoiseWithDerivativesImproveXy(vec3 x) {
    x = mat3(
        0.788675134594813, -0.211324865405187, -0.577350269189626,
        -0.211324865405187, 0.788675134594813, -0.577350269189626,
        0.577350269189626, 0.577350269189626, 0.577350269189626
    ) * x;
    vec4 result = os2NoiseWithDerivativesPart(x) + os2NoiseWithDerivativesPart(x + 144.5);
    result.xyz = mat3(
        0.788675134594813, -0.211324865405187, -0.577350269189626,
        -0.211324865405187, 0.788675134594813, -0.577350269189626,
        0.577350269189626, 0.577350269189626, 0.577350269189626
    ) * result.xyz;
    return result;
}

float gradientWave(float b, float t) {
    return smoothstep(0.0, b, t) * smoothstep(1.0, b, t);
}

float random(vec2 uv, float seed) {
    return fract(sin(dot(uv * 13.235, vec2(12.9898, 78.233)) * 0.000001) * 43758.5453123 * seed);
}

vec3 randomVec3(vec2 uv, float seed) {
    return vec3(random(uv, seed), random(uv * 2.0, seed), random(uv * 3.0, seed));
}

float mapToRange(float edge0, float edge1, float x) {
    return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float proportionalMapToRange(float edge0, float edge1, float x) {
    return edge0 + (edge1 - edge0) * x;
}

vec3 raindropSurface(vec2 xy, float distanceScale, float zScale) {
    float a = distanceScale;
    float x = xy.x;
    float y = xy.y;
    float n = 1.5;
    float m = 0.5;
    float s = zScale;
    float tempZ = 1.0 - pow(x / a, 2.0) - pow(y / a, 2.0);
    float z = pow(max(0.0, tempZ), a / 2.0);
    float zInMAndN = (z - m) / (n - m);
    float t = clamp(zInMAndN, 0.0, 1.0);
    float height = s * t * t * (3.0 - 2.0 * t);
    float part01 = s * (6.0 * t - 8.0 * t * t);
    float part02 = 1.0 / (n - m);
    float part03 = -1.0 / a * pow(max(0.0, tempZ), a / 2.0 - 1.0);
    float tempValue = (zInMAndN > 0.0 && zInMAndN < 1.0) ? part01 * part02 : 0.0;
    vec2 partialDerivative = height > 0.0
        ? vec2(tempValue * (x * part03), tempValue * (y * part03))
        : vec2(0.0);
    return vec3(height, partialDerivative);
}

vec3 staticRaindrops(vec2 uv, float t, float uvScale, float density) {
    vec2 tempUv = uv * uvScale;
    vec2 id = floor(tempUv);
    vec3 randomValue = randomVec3(vec2(id.x * 470.15, id.y * 653.58), 4.3315);
    tempUv = fract(tempUv) - 0.5;
    vec2 randomPoint = (randomValue.xy - 0.5) * 0.25;
    vec2 xy = randomPoint - tempUv;
    float distance = length(tempUv - randomPoint);
    vec3 noiseInput = vec3(vec2(tempUv.x * 305.0 * 0.02, tempUv.y * 305.0 * 0.02), 1.8660254037844386);
    vec4 noiseResult = os2NoiseWithDerivativesImproveXy(noiseInput);
    float edgeRandomCurveAdjust = noiseResult.w * mix(0.02, 0.175, fract(randomValue.x));
    distance = edgeRandomCurveAdjust * 0.5 + distance;
    distance = distance * clamp(mix(1.0, 55.0, randomPoint.x), 1.0, 3.0);
    float gradientFade = gradientWave(0.0005, fract(t * 0.02 + randomValue.z));
    float distanceMaxRange = 1.45 * gradientFade;
    vec2 direction = tempUv - randomPoint;
    float theta = PI - acos(dot(normalize(direction), vec2(0.0, 1.0)));
    theta = theta * randomValue.z;
    float distanceScale = 0.2 / (1.0 - 0.8 * cos(theta - PI / 2.0 - 1.6));
    float yDistance = length(vec2(0.0, tempUv.y) - vec2(0.0, randomPoint.y));
    float scale = 1.65 * (0.2 + distanceScale) * distanceMaxRange * mix(1.5, 0.5, randomValue.x);
    vec2 tempXy = vec2(xy.x, xy.y) * 4.0;
    float randomScale = proportionalMapToRange(0.85, 1.35, randomValue.z);
    tempXy.x = randomScale * mix(tempXy.x, tempXy.x / smoothstep(1.0, 0.4, yDistance * randomValue.z), smoothstep(1.0, 0.0, randomValue.x));
    tempXy = tempXy + edgeRandomCurveAdjust;
    vec3 heightAndNormal = raindropSurface(tempXy, scale, 1.0);
    heightAndNormal.yz = -heightAndNormal.yz;
    float randomVisible = fract(randomValue.z * 10.0 * 4.3315) < density ? 1.0 : 0.0;
    heightAndNormal.yz = heightAndNormal.yz * randomVisible;
    heightAndNormal.x = smoothstep(0.0, 1.0, heightAndNormal.x) * randomVisible;
    return heightAndNormal;
}

vec4 rollingRaindrops(vec2 uv, float t, float uvScale, float density) {
    vec2 localUv = uv * uvScale;
    vec2 tempUv = localUv;
    vec2 constantA = vec2(6.0, 1.0);
    vec2 gridNum = constantA * 2.0;
    vec2 gridId = floor(localUv * gridNum);
    float randomFloat = random(vec2(gridId.x * 131.26, gridId.x * 101.81), 4.3315);
    float timeMovingY = t * 0.85 * proportionalMapToRange(0.1, 0.25, randomFloat);
    localUv.y += timeMovingY + randomFloat;
    vec2 scaledUv = localUv * gridNum;
    gridId = floor(scaledUv);
    vec3 randomVec3Value = randomVec3(vec2(gridId.x * 17.32, gridId.y * 2217.54), 4.3315);
    vec2 gridUv = fract(scaledUv) - vec2(0.5, 0.0);
    float swingX = randomVec3Value.x - 0.5;
    float swingY = tempUv.y * 20.0;
    float swingPosition = sin(swingY + sin(gridId.y * randomVec3Value.z + swingY) + gridId.y * randomVec3Value.z);
    swingX += swingPosition * (0.5 - abs(swingX)) * (randomVec3Value.z - 0.5);
    swingX *= 0.65;
    float randomNormalizedTime = fract(timeMovingY + randomVec3Value.z);
    swingY = clamp((gradientWave(0.87, randomNormalizedTime) - 0.5) * 0.9 + 0.5, 0.15, 0.85);
    vec2 position = vec2(swingX, swingY);
    vec2 xy = position - gridUv;
    vec2 direction = (gridUv - position) * constantA.yx;
    float distance = length(direction);
    vec3 noiseInput = vec3(vec2(tempUv.x * 513.20 * 0.02, tempUv.y * 779.40 * 0.02), 2.1660251037743386);
    vec4 noiseResult = os2NoiseWithDerivativesImproveXy(noiseInput);
    float edgeRandomCurveAdjust = noiseResult.w * mix(0.02, 0.175, fract(randomVec3Value.y));
    distance = edgeRandomCurveAdjust + distance;
    float theta = PI - acos(dot(normalize(direction), vec2(0.0, 1.0)));
    theta = theta * randomVec3Value.z;
    float distanceScale = 0.2 / (1.0 - 0.8 * cos(theta - PI / 2.0 - 1.6));
    float scale = 1.65 * (0.2 + distanceScale) * 1.45 * mix(1.0, 0.25, randomVec3Value.x);
    vec2 tempXy = vec2(xy.x, xy.y) * 4.0;
    tempXy = tempXy * vec2(1.0, 4.2) + edgeRandomCurveAdjust * 0.85;
    vec3 heightAndNormal = raindropSurface(tempXy, scale, 1.0);
    float trailY = pow(smoothstep(1.0, swingY, gridUv.y), 0.5);
    float trailX = abs(gridUv.x - swingX) * mix(0.8, 4.0, smoothstep(0.0, 1.0, randomVec3Value.x));
    float trail = smoothstep(0.25 * trailY, 0.15 * trailY * trailY, trailX);
    float trailClamp = smoothstep(-0.02, 0.02, gridUv.y - swingY);
    trail *= trailClamp * trailY;
    float signOfTrailX = sign(gridUv.x - swingX);
    vec3 trailNoiseInput = vec3(vec2(tempUv.x * 513.20 * 0.02 * signOfTrailX, tempUv.y * 779.40 * 0.02), 2.1660251037743386);
    vec4 trailNoiseResult = os2NoiseWithDerivativesImproveXy(trailNoiseInput);
    float trailEdgeRandomCurveAdjust = trailNoiseResult.w * mix(0.002, 0.175, fract(randomVec3Value.y));
    float trailXDistance = mapToRange(0.0, 0.1, trailEdgeRandomCurveAdjust * 0.5 + trailX);
    vec2 trailDirection = signOfTrailX * vec2(1.0, 0.0) + vec2(0.0, 1.0) * smoothstep(1.0, 0.0, trail) * 0.5;
    vec2 trailXy = trailDirection * trailXDistance;
    vec3 trailHeightAndNormal = raindropSurface(trailXy, 1.0, 1.0);
    trailHeightAndNormal *= pow(trail * randomVec3Value.y, 2.0);
    trailHeightAndNormal.x = smoothstep(0.0, 1.0, trailHeightAndNormal.x);
    swingY = tempUv.y;
    float remainTrail = smoothstep(0.2 * trailY, 0.0, trailX);
    float remainDroplet = max(0.0, sin(swingY * (1.0 - swingY) * 120.0) - gridUv.y) * remainTrail * trailClamp * randomVec3Value.z;
    swingY = fract(swingY * 10.0) + (gridUv.y - 0.5);
    vec2 remainDropletXy = gridUv - vec2(swingX, swingY);
    remainDropletXy = remainDropletXy * vec2(1.2, 0.8) + edgeRandomCurveAdjust * 0.85;
    vec3 remainDropletHeightAndNormal = raindropSurface(remainDropletXy, 2.0 * remainDroplet, 1.0);
    remainDropletHeightAndNormal.x = smoothstep(0.0, 1.0, remainDropletHeightAndNormal.x);
    remainDropletHeightAndNormal = trailHeightAndNormal.x > 0.0 ? vec3(0.0) : remainDropletHeightAndNormal;
    vec4 returnValue;
    returnValue.x = heightAndNormal.x + trailHeightAndNormal.x * trailY * trailClamp + remainDropletHeightAndNormal.x * trailY * trailClamp;
    returnValue.yz = heightAndNormal.yz + trailHeightAndNormal.yz + remainDropletHeightAndNormal.yz;
    returnValue.w = trail;
    float randomVisible = fract(randomVec3Value.z * 20.0 * 4.3315) < density ? 1.0 : 0.0;
    returnValue *= randomVisible;
    return returnValue;
}

vec4 raindrops(vec2 uv, float t, float staticScale, float rollingScale, float density) {
    vec4 staticRaindrop = vec4(staticRaindrops(uv, t, staticScale, density), 0.0);
    vec4 rollingRaindrop = rollingRaindrops(uv, t, rollingScale, density);
    float height = staticRaindrop.x + rollingRaindrop.x;
    vec2 normal = staticRaindrop.yz + rollingRaindrop.yz;
    float trail = rollingRaindrop.w;
    return vec4(height, normal, trail);
}

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    float scaledTime = uTime * uSpeed;
    vec2 scenePos = vec2(fragCoord.x, uResolution.y - fragCoord.y);
    vec2 localUv = (scenePos - 0.5 * uResolution) / uResolution.y;
    float staticUvScale = 20.0 / max(0.1, uSize);
    float rollingUvScale = 2.25 / max(0.1, uSize);
    vec4 raindrop = raindrops(localUv, scaledTime, staticUvScale, rollingUvScale, uDensity);
    float height = raindrop.x;
    vec2 normal = raindrop.yz;
    float dropMask = smoothstep(0.02, 0.15, height);
    float lightX = cos(uLightAngle);
    float lightY = sin(uLightAngle);
    vec3 lightDir = normalize(vec3(lightX, lightY, 1.5));
    vec3 surfaceNormal = normalize(vec3(normal.x, normal.y, 1.0 - height));
    float specular = max(0.0, dot(surfaceNormal, lightDir));
    specular = pow(specular, 24.0);
    float edgeShadow = smoothstep(0.2, 1.0, length(normal)) * uShadow;
    float baseBrightness = clamp(0.15 * height + specular - edgeShadow, 0.0, 1.0);
    /* 网页适配：原插件把此层盖在深色歌词背景上，高光可以很亮；本站两页信息密度高，
       把高光压成柔和的玻璃反光，避免白条盖住文字。算法/高度场/取景完全一致。 */
    float alpha = dropMask * clamp(0.25 + specular, 0.0, 1.0) * 0.26;
    float lum = baseBrightness * 0.5;
    gl_FragColor = vec4(lum, lum, lum, alpha);
}`; })();

  var PARAMS = { speed: 0.6, size: 1.4, density: 0.32, lightAngle: Math.PI / 3, shadow: 0.0 };

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canvas = document.getElementById('rain-canvas');
  var btn = document.getElementById('rain-toggle');
  if (!canvas || !canvas.getContext) return;

  var gl = null, prog = null, u = {}, loc = {}, ok = false;
  var cw = 0, ch = 0;
  var on = false, raf = 0, last = 0, tSec = 0, frames = 0, lastPaint = 0, busyUntil = 0;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      try { console.warn('rain shader compile failed:', gl.getShaderInfoLog(s)); } catch (e) {}
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function init() {
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true })
        || canvas.getContext('experimental-webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true });
    } catch (e) { gl = null; }
    if (!gl) return false;
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      try { console.warn('rain program link failed:', gl.getProgramInfoLog(prog)); } catch (e) {}
      return false;
    }
    gl.useProgram(prog);
    loc.pos = gl.getAttribLocation(prog, 'aPos');
    ['uTime', 'uResolution', 'uSpeed', 'uSize', 'uDensity', 'uLightAngle', 'uShadow'].forEach(function (k) {
      u[k] = gl.getUniformLocation(prog, k);
    });
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    ok = true;
    return true;
  }

  function resize() {
    if (!ok) return;
    // 0.55× 渲染再 CSS 放大：纯装饰层无需逐像素锐利，省下的片元开销让主交互不掉帧
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.55;
    cw = Math.max(1, Math.round(window.innerWidth * dpr));
    ch = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
  }

  function draw(ts) {
    if (!on || !ok) return;
    // 用户交互后短暂让路：点击后的同步重排/动画不能被装饰层的片元开销拖慢
    //（verify118 B9「切换瞬间详情容器仍从旧高度起步」就是被抢帧推走的）
    if (performance.now() < busyUntil || (lastPaint && ts - lastPaint < 32)) {
      raf = window.requestAnimationFrame(draw);
      return;
    }
    lastPaint = ts;
    if (last) tSec += Math.min((ts - last) / 1000, 0.05); // 切标签回来不让时间跳变
    last = ts;
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniform1f(u.uTime, tSec);
    gl.uniform2f(u.uResolution, cw, ch);
    gl.uniform1f(u.uSpeed, PARAMS.speed);
    gl.uniform1f(u.uSize, PARAMS.size);
    gl.uniform1f(u.uDensity, PARAMS.density);
    gl.uniform1f(u.uLightAngle, PARAMS.lightAngle);
    gl.uniform1f(u.uShadow, PARAMS.shadow);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    frames++;
    raf = window.requestAnimationFrame(draw);
  }

  function clear() {
    if (!ok) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function paintBtn() {
    if (!btn) return;
    var active = on && !reduced.matches;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.textContent = active ? '雨滴 开' : '雨滴 关';
    btn.disabled = reduced.matches || !ok;
  }

  function setEnabled(v, persist) {
    var want = !!v && ok && !reduced.matches;
    on = want;
    if (persist !== false) {
      try { localStorage.setItem('rain.enabled', want ? '1' : '0'); } catch (e) {}
    }
    paintBtn();
    if (on) {
      resize();
      last = 0;
      if (!raf) raf = window.requestAnimationFrame(draw);
    } else {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      clear();
    }
    notify();
    return on;
  }

  function readStored() {
    var saved = null;
    try { saved = localStorage.getItem('rain.enabled'); } catch (e) {}
    if (saved === '0') return false;
    if (saved === '1') return true;
    return !reduced.matches; // 未选过：默认开（插件默认），减少动效时关
  }

  var listeners = [];
  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](on); } catch (e) {}
    }
  }

  if (btn) {
    btn.disabled = true;   // 首屏骨架屏未退场前不接管开关，避免抢主线程
    btn.addEventListener('click', function () {
      if (!ok || btn.disabled) return;
      setEnabled(!on);
    });
  }

  ['pointerdown', 'click', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { busyUntil = performance.now() + 300; }, true);
  });

  document.addEventListener('visibilitychange', function () {
    if (!ok) return;
    if (document.hidden) {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0; last = 0;
    } else if (on) {
      last = 0;
      if (!raf) raf = window.requestAnimationFrame(draw);
    }
  });

  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (on) resize(); }, 160);
  });

  function onReducedChange() {
    if (reduced.matches) setEnabled(false, false);
    else paintBtn();
  }
  if (reduced.addEventListener) reduced.addEventListener('change', onReducedChange);
  else if (reduced.addListener) reduced.addListener(onReducedChange);

  /* 对外最小 API：供页面与验收套件复用同一份状态 */
  window.__rain = {
    ready: function () { return ok; },
    canvas: canvas,
    gl: gl,
    params: PARAMS,
    reduced: function () { return reduced.matches; },
    enabled: function () { return on; },
    toggle: function () { return setEnabled(!on); },
    set: function (v) { return setEnabled(v); },
    frames: function () { return frames; },
    error: function () { return gl ? gl.getError() : -1; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    /* 读回像素，确认画布确实画出了水滴（验收用） */
    sample: function () {
      if (!ok || !cw || !ch) return { pixels: 0, total: 0 };
      var sw = Math.min(240, cw), sh = Math.min(160, ch);
      var buf = new Uint8Array(sw * sh * 4);
      gl.readPixels(Math.floor((cw - sw) / 2), Math.floor((ch - sh) / 2), sw, sh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      var n = 0;
      for (var i = 3; i < buf.length; i += 4) if (buf[i] > 4) n++;
      return { pixels: n, total: sw * sh };
    }
  };

  function boot() {
    if (init()) {
      resize();
      setEnabled(readStored(), false);
    } else {
      paintBtn();
      try { canvas.style.display = 'none'; } catch (e) {}
    }
  }

  /* 装饰层不能抢首屏：index 的骨架屏还在时创建 WebGL 上下文会让榜单晚渲染，
     700px 下骨架行固定宽度会短暂撑出横向滚动（verify58 B[700] 抓到过）。
     等骨架退场再启动，最多等 3 s 兜底；watch 页没有骨架，立即启动。 */
  var waited = 0;
  function bootWhenReady() {
    if (document.querySelector('.sk-block') && waited < 25) {
      waited++;
      setTimeout(bootWhenReady, 120);
      return;
    }
    boot();
  }
  bootWhenReady();
})();
