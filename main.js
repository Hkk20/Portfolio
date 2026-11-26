(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const small = matchMedia("(max-width: 760px)");

  const ptr = { x: innerWidth * 0.5, y: innerHeight * 0.45, v: 0, at: -1e9 };
  addEventListener("pointermove", (e) => {
    ptr.v = Math.min(1, ptr.v + Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) * 0.0035);
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.at = performance.now();
  }, { passive: true });

  /* ---------------------------------------------------------- name fills the width, leaving room for the photo */
  const name = $("#name"), front = $(".front .name"), hero = $("#top");
  let gapX = 0;
  function fitName() {
    const W = document.documentElement.clientWidth, H = innerHeight;
    let shift;
    if (small.matches) {
      name.style.fontSize = front.style.fontSize = "";
      shift = W * 0.06;
    } else {
      name.style.fontSize = "100px";
      const ink = name.firstElementChild.offsetWidth + name.lastElementChild.offsetWidth;
      name.style.fontSize = Math.min(((name.clientWidth - H * 0.205) / ink) * 100, H * 0.4) + "px";
      front.style.fontSize = name.style.fontSize;
      // The group stands on the right, just clear of the line of text in the corner.
      const u = Math.max(H, 520) / 100, side = name.getBoundingClientRect().left;
      const face = W - side - W * 0.11 - 23.5 * u - 4 * u - W * 0.014;
      shift = face - W / 2;
    }
    hero.style.setProperty("--gap", shift.toFixed(1) + "px");
    gapX = shift / H;
  }

  /* ---------------------------------------------------------- the sentence comes into focus */
  const lit = $("[data-lit]"), words = [];
  if (!calm.matches) {
    const text = lit.textContent.trim().split(/\s+/);
    lit.textContent = "";
    text.forEach((w, i) => {
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = w;
      lit.append(s, i < text.length - 1 ? " " : "");
      words.push(s);
    });
  }
  function paintLit() {
    if (!words.length) return;
    const r = lit.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) return;
    const head = clamp((innerHeight * 0.86 - r.top) / (r.height + innerHeight * 0.22)) * (words.length + 7);
    words.forEach((w, i) => {
      const o = clamp((head - i) / 7);
      w.style.setProperty("--o", (0.13 + 0.87 * o).toFixed(3));
      w.style.setProperty("--b", o >= 1 ? "0" : ((1 - o) * 6).toFixed(1) + "px");
    });
  }

  /* ---------------------------------------------------------- dark / light */
  // The page follows the system setting. The button can pin the other one, kept in <meta name="color-scheme">
  // (CSS reads it from there) and in localStorage. Picking what the system already shows removes the pin.
  const html = document.documentElement, mode = $("#mode"), flip = $("#flip");
  const scheme = $('meta[name="color-scheme"]'), tints = document.querySelectorAll('meta[name="theme-color"]');
  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => scheme.content === "dark" || (scheme.content !== "light" && sysDark.matches);
  let dark = isDark(), turning = false, swap = false;
  const label = () => {
    mode.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    tints.forEach((m) => { m.content = dark ? "#0b0b0b" : "#f4f4f4"; });
  };
  label();
  const pin = (value) => {
    scheme.content = value === "light" || value === "dark" ? value : "light dark";
    dark = isDark();
    label();
  };
  // The disc already shows the opposite, so the real colours change in the same frame it is removed.
  const settle = () => {
    html.classList.add("still");
    const want = dark ? "light" : "dark", keep = want !== (sysDark.matches ? "dark" : "light");
    try { if (keep) localStorage.setItem("mode", want); else localStorage.removeItem("mode"); } catch (e) { /* private window */ }
    pin(keep ? want : null);
    html.classList.remove("turning");
    flip.style.visibility = "hidden";
    turning = false;
    requestAnimationFrame(() => html.classList.remove("still"));
  };
  // The system setting or another tab can change the scheme at any time.
  const resync = () => { if (!turning) { dark = isDark(); label(); force = true; } };
  sysDark.addEventListener("change", resync);
  addEventListener("storage", (e) => {
    if (e.key !== "mode" && e.key !== null) return;
    pin(e.newValue);
    force = true;
  });
  mode.addEventListener("click", () => {
    if (turning) return;
    if (calm.matches) { settle(); force = true; return; }
    turning = true;
    const r = mode.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 40;
    html.classList.add("turning");
    flip.style.visibility = "visible";
    const run = flip.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
      { duration: 950, easing: "cubic-bezier(.7, 0, .2, 1)", fill: "forwards" }
    );
    run.onfinish = () => { swap = () => { run.cancel(); settle(); }; };
  });

  const S = { x: 0, y: 0, scale: 0.5, yaw: 0, pitch: 0, rip: 0, bound: 1.34, turn: 0, size: 0.5, ready: false };

  /* ---------------------------------------------------------- clicking the metal */
  const hits = [{ x: 0, y: 0, z: 1, t: -9 }, { x: 0, y: 0, z: 1, t: -9 }];
  const drops = Array.from({ length: 4 }, () => ({ p: [0, 0, 0], v: [0, 0, 0], r: 0, age: 9 }));
  const dropData = new Float32Array(16);
  const jelly = { x: 0, v: 0, spin: 0 };
  // Where on the metal a screen point lands, in the metal's own space. Null if it misses.
  function touch(cx, cy, reach) {
    const H = canvas.clientHeight, W = canvas.clientWidth;
    let d = [((cx - W / 2) / H - S.x) / S.scale, (-(cy - H / 2) / H - S.y) / S.scale, -1.75];
    const n = Math.hypot(...d);
    d = d.map((q) => q / n);
    const b = 4.6 * d[2], c = 4.6 * 4.6 - reach * reach, h = b * b - c;
    if (h < 0) return null;
    const s = -b - Math.sqrt(h);
    let x = d[0] * s, y = d[1] * s, z = 4.6 + d[2] * s;
    let co = Math.cos(S.pitch), si = Math.sin(S.pitch);
    [y, z] = [co * y + si * z, -si * y + co * z];
    co = Math.cos(S.yaw); si = Math.sin(S.yaw);
    [x, z] = [co * x + si * z, -si * x + co * z];
    const l = Math.hypot(x, y, z) || 1;
    return [(x / l) * 0.95, (y / l) * 0.95, (z / l) * 0.95];
  }
  addEventListener("click", (e) => {
    if (calm.matches || e.target.closest("a, button, .card")) return;
    const p = touch(e.clientX, e.clientY, 1.0);
    if (!p) return;
    const t = performance.now() / 1000;
    hits.unshift(hits.pop());
    Object.assign(hits[0], { x: p[0], y: p[1], z: p[2], t });
    jelly.v -= 5.5;
    jelly.spin += ((e.clientX / innerWidth - 0.5 - S.x * (innerHeight / innerWidth)) > 0 ? 1 : -1) * 1.5;
    drops.forEach((q, i) => {
      const a = (i / 4) * 6.283 + Math.random() * 1.2, w = 0.55 + Math.random() * 0.5;
      const up = Math.abs(p[1]) > 0.8 ? [1, 0, 0] : [0, 1, 0];
      let u1 = [p[1] * up[2] - p[2] * up[1], p[2] * up[0] - p[0] * up[2], p[0] * up[1] - p[1] * up[0]];
      const l1 = Math.hypot(...u1) || 1;
      u1 = u1.map((v) => v / l1);
      const n = p.map((v) => v / 0.95);
      const u2 = [n[1] * u1[2] - n[2] * u1[1], n[2] * u1[0] - n[0] * u1[2], n[0] * u1[1] - n[1] * u1[0]];
      const out = 5.2 + Math.random() * 2.4;
      q.p = p.map((v) => v * 0.72);
      q.v = [0, 1, 2].map((k) => n[k] * out * 0.7 + (u1[k] * Math.cos(a) + u2[k] * Math.sin(a)) * out * w);
      q.r = 0.14 + Math.random() * 0.12;
      q.age = 0;
    });
  });
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || !S.ready) return;
    const over = !calm.matches && !e.target.closest("a, button, .card") && touch(e.clientX, e.clientY, 0.95);
    html.style.cursor = over ? "pointer" : "";
  }, { passive: true });
  function runClicks(dt) {
    const steps = Math.max(1, Math.ceil(dt / 0.012)), h = dt / steps;
    for (let k = 0; k < steps; k++) {
      jelly.v += (-jelly.x * 170 - jelly.v * 7.5) * h;
      jelly.x += jelly.v * h;
      for (const q of drops) {
        if (q.r <= 0) continue;
        q.age += h;
        const l = Math.hypot(...q.p);
        for (let i = 0; i < 3; i++) {
          q.v[i] += (-q.p[i] * (8 + q.age * 13) - q.v[i] * 1.7) * h;
          q.p[i] += q.v[i] * h;
        }
        if (q.age > 0.55 && l < 0.6) q.r = Math.max(0, q.r - h * 0.5);
        if (q.age > 3.2) q.r = 0;
      }
    }
    jelly.spin *= Math.exp(-dt * 1.6);
    let far = 1.34;
    drops.forEach((q, i) => {
      dropData.set([q.p[0], q.p[1], q.p[2], q.r], i * 4);
      if (q.r > 0) far = Math.max(far, 1.5, Math.hypot(...q.p) + q.r + 0.12);
    });
    const live = performance.now() / 1000 - hits[0].t < 2;
    S.bound = Math.min(2.6, live ? Math.max(far, 1.55) : far);
  }

  /* ---------------------------------------------------------- liquid metal */
  const canvas = $("#metal");
  const metal = (() => {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) { canvas.style.display = "none"; return null; }
    const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const fs = `
    precision highp float;
    uniform vec2 uRes,uPos;uniform float uTime,uYaw,uPitch,uScale,uRip,uInv,uBound;uniform vec4 uHitA,uHitB,uDrop[4];
    // a click: the surface dents, springs back, and sends rings outward
    float struck(vec4 h,vec3 p){
      if(h.w>3.) return 0.;
      float l=distance(p,h.xyz),a=h.w;
      return .26*exp(-l*l*3.)*exp(-a*3.2)*cos(a*9.5)*smoothstep(0.,.07,a)
           +.05*sin(l*10.-a*13.)*exp(-a*1.8)*exp(-l*.7)*smoothstep(0.,.16,a);
    }
    float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
    float map(vec3 p){
      vec3 q=p*1.35+vec3(0.,uTime*.25,uTime*.18);
      float d=length(p)-.94;
      d+=.20*sin(q.x*1.7+sin(q.y*1.3))*sin(q.y*1.9+q.z)*sin(q.z*1.6);
      d+=.085*sin(q.x*3.1+uTime*.3)*sin(q.y*2.7)*sin(q.z*3.3);
      if(uRip>.002) d+=uRip*.035*(sin(p.y*7.-uTime*5.+sin(p.x*5.))*.6+sin(p.x*8.+p.z*6.+uTime*4.)*.4);
      d+=struck(uHitA,p)+struck(uHitB,p);
      if(uBound>1.4){for(int i=0;i<4;i++){if(uDrop[i].w>.002) d=smin(d,length(p-uDrop[i].xyz)-uDrop[i].w,.3);}}
      return d;
    }
    vec3 nrm(vec3 p){
      vec2 e=vec2(.0022,-.0022);
      return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));
    }
    mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    float bx(float x,float c,float w,float f){return smoothstep(w+f,w,abs(x-c));}
    float env(vec3 d){
      float u=atan(d.x,d.z), v=asin(clamp(d.y,-1.,1.));
      float a=d.y*3.0+sin(d.x*2.4+d.z*1.2+uTime*.12)*.8;
      float e=.015+pow(smoothstep(-.15,.95,sin(a*1.5+.5)),1.8)*.25;
      e+=.34*bx(u,-.95,.34,.22)*bx(v,.42,.36,.24);
      e+=1.35*bx(u,1.32,.045,.05)*bx(v,.10,.95,.25);
      e+=.75*bx(u,-2.15,.06,.07)*bx(v,0.,.9,.3);
      e+=.6*bx(u,2.5,.10,.10)*bx(v,.1,.7,.3);
      e+=.34*smoothstep(.72,1.15,v);
      e+=.22*smoothstep(-.25,-1.1,v);
      return e;
    }
    void main(){
      vec2 uv=((gl_FragCoord.xy-.5*uRes)/uRes.y-uPos)/uScale;
      vec3 ro=vec3(0.,0.,4.6),rd=normalize(vec3(uv,-1.75));
      gl_FragColor=vec4(0.);
      float b=dot(ro,rd),c=dot(ro,ro)-uBound*uBound,h=b*b-c;
      if(h<=0.) return;
      h=sqrt(h);
      float t=-b-h,tm=-b+h,near=9.,tn=t;
      vec3 O=ro,D=rd;
      O.yz=rot(uPitch)*O.yz;D.yz=rot(uPitch)*D.yz;
      O.xz=rot(uYaw)*O.xz;D.xz=rot(uYaw)*D.xz;
      float px=1./(uRes.y*uScale*1.75);
      for(int i=0;i<92;i++){
        float s=map(O+D*t);
        float k=s/(t*px);
        if(k<near){near=k;tn=t;}
        if(s<.0009){near=0.;tn=t;break;}
        t+=s*.64;
        if(t>tm) break;
      }
      if(near>=1.) return;
      vec3 n=nrm(O+D*tn);
      n.xz=rot(-uYaw)*n.xz;n.yz=rot(-uPitch)*n.yz;
      vec3 r=reflect(rd,n);
      float fr=pow(1.-max(dot(n,-rd),0.),3.2);
      float col=env(r)*(.52+.75*fr)+fr*.12;
      col=1.-exp(-col*1.6);
      col=pow(col,1.06);
      float A=clamp(1.-near,0.,1.);
      vec3 f=mix(vec3(.93,.96,1.),vec3(1.),col)*col;
      f=mix(f,1.-f,uInv);
      gl_FragColor=vec4(f*A,A);
    }`;
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, make(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) {
      console.error("Metal shader failed:", err.message);
      canvas.style.display = "none";
      return null;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    ["uRes", "uPos", "uTime", "uYaw", "uPitch", "uScale", "uRip", "uInv", "uBound", "uHitA", "uHitB", "uDrop"].forEach((n) => { u[n] = gl.getUniformLocation(prog, n); });

    let quality = Math.min(devicePixelRatio || 1, 1.75);
    const fit = () => {
      canvas.width = Math.max(2, Math.round(canvas.clientWidth * quality));
      canvas.height = Math.max(2, Math.round(canvas.clientHeight * quality));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    fit();

    // Lower the resolution only if the graphics chip itself can't keep up.
    const timer = gl.getExtension("EXT_disjoint_timer_query");
    let query = null, waiting = false, slow = 0;
    const pace = () => {
      if (!timer || !waiting || !timer.getQueryObjectEXT(query, timer.QUERY_RESULT_AVAILABLE_EXT)) return;
      waiting = false;
      if (gl.getParameter(timer.GPU_DISJOINT_EXT)) return;
      slow = timer.getQueryObjectEXT(query, timer.QUERY_RESULT_EXT) / 1e6 > 13 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 12 && quality > 0.65) { slow = 0; quality *= 0.85; fit(); }
    };
    const draw = (t, v) => {
      pace();
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform2f(u.uPos, v.x, v.y);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uYaw, v.yaw);
      gl.uniform1f(u.uPitch, v.pitch);
      gl.uniform1f(u.uScale, v.scale);
      gl.uniform1f(u.uRip, v.rip);
      gl.uniform1f(u.uInv, dark ? 1 : 0);
      gl.uniform4f(u.uHitA, hits[0].x, hits[0].y, hits[0].z, t - hits[0].t);
      gl.uniform4f(u.uHitB, hits[1].x, hits[1].y, hits[1].z, t - hits[1].t);
      gl.uniform4fv(u.uDrop, dropData);
      gl.uniform1f(u.uBound, v.bound);
      const timed = timer && !waiting;
      if (timed) { query = query || timer.createQueryEXT(); timer.beginQueryEXT(timer.TIME_ELAPSED_EXT, query); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (timed) { timer.endQueryEXT(timer.TIME_ELAPSED_EXT); waiting = true; }
    };
    return { fit, draw };
  })();

  /* ---------------------------------------------------------- where the metal sits */
  const work = $("#work"), hi = $("#hi");
  
  let born = performance.now() / 1000;
  function view(t, dt) {
    const W = canvas.clientWidth, H = canvas.clientHeight, vh = innerHeight, asp = W / H, sm = small.matches;
    const toAbout = smooth(0.1, 0.8, scrollY / vh);
    const toWork = smooth(0.75, 0.15, work.getBoundingClientRect().top / vh);
    const toHi = smooth(0.85, 0.25, hi.getBoundingClientRect().top / vh);
    const px = (ptr.x - W / 2) / H, py = -(ptr.y - H / 2) / H;
    const idle = calm.matches || performance.now() - ptr.at > 4000;

    let x = gapX, y = sm ? 0.0 : 0.045, scale = sm ? Math.min(0.66, asp * 1.36) : 1.02;
    if (!idle) { x += px * 0.035; y += py * 0.03; }
    x = lerp(x, sm ? 0.16 * asp : 0.33 * asp, toAbout);
    y = lerp(y, sm ? 0.3 : 0, toAbout);
    scale = lerp(scale, sm ? 0.36 : 0.76, toAbout);
    x = lerp(x, idle || sm ? 0 : px * 0.05, toWork);
    y = lerp(y, sm ? 0.02 : -0.05, toWork);
    scale = lerp(scale, sm ? Math.min(0.5, asp * 1.05) : 0.8, toWork);
    x = lerp(x, sm ? 0.1 * asp : 0.25 * asp, toHi);
    y = lerp(y, sm ? -0.02 : -0.08, toHi);
    scale = lerp(scale, sm ? 0.5 : 0.92, toHi);
    if (!calm.matches) scale *= lerp(0.55, 1, 1 - Math.pow(1 - clamp((t - born) / 1.6), 4));

    const k = calm.matches || !S.ready ? 1 : 1 - Math.exp(-dt * 6);
    S.ready = true;
    S.x = lerp(S.x, x, k);
    S.y = lerp(S.y, y, k);
    runClicks(calm.matches ? 0 : dt);
    S.size = lerp(S.size, scale, k);
    S.scale = S.size * (1 + jelly.x * 0.16);
    const k2 = calm.matches ? 1 : 1 - Math.exp(-dt * 4);
    S.turn += jelly.spin * dt;
    S.look = lerp(S.look || 0, idle ? Math.sin(t * 0.3) * 0.4 : -(px - S.x) * 0.8, k2);
    S.yaw = S.look + S.turn;
    S.pitch = lerp(S.pitch, idle ? 0 : clamp(-(py - S.y) * 0.6, -0.4, 0.4), k2);
    ptr.v *= Math.exp(-dt * 2.2);
    S.rip = lerp(S.rip, calm.matches ? 0 : ptr.v, 1 - Math.exp(-dt * 6));
    return S;
  }

  /* ---------------------------------------------------------- the card holder */
  const deck = $("#deck");
  let order = [...deck.querySelectorAll(".card")], opened = null, busy = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, calm.matches ? 0 : ms));
  const seat = (skip) => order.forEach((c, k) => {
    c.style.setProperty("--k", k);
    if (c !== skip) c.style.zIndex = order.length - k;
  });
  function sizeOpen(c) {
    const w = Math.min(innerWidth * 0.92, 800), h = Math.min(Math.max(w / 1.586, small.matches ? 400 : 0), innerHeight * 0.8);
    c.style.setProperty("--w", w + "px");
    c.style.setProperty("--h", h + "px");
    c.style.setProperty("--oy", deck.offsetHeight / 2 - h / 2 - c.offsetTop - innerHeight * 0.03 + "px");
  }
  const tell = (c, on) => {
    const b = c.querySelector(".hit");
    b.setAttribute("aria-expanded", String(on));
    b.setAttribute("aria-label", on ? "Put " + b.dataset.name + " back" : "Open " + b.dataset.name);
    c.querySelector(".face-b").inert = !on;
  };
  async function openCard(c) {
    busy = true;
    opened = c;
    const r = deck.getBoundingClientRect();
    if (Math.abs(r.top + r.height / 2 - innerHeight / 2) > innerHeight * 0.2) deck.scrollIntoView({ block: "center", behavior: calm.matches ? "auto" : "smooth" });
    c.classList.add("out");
    await wait(300);
    c.style.zIndex = 40;
    sizeOpen(c);
    c.classList.replace("out", "open");
    deck.classList.add("has-open");
    tell(c, true);
    await wait(650);
    busy = false;
  }
  async function closeCard() {
    const c = opened;
    if (!c) return;
    busy = true;
    tell(c, false);
    // Back of the set, so the next card is the one in front.
    order = order.filter((q) => q !== c).concat(c);
    c.style.removeProperty("--w");
    c.style.removeProperty("--h");
    c.classList.replace("open", "out");
    deck.classList.remove("has-open");
    seat(c);
    await wait(640);
    seat();
    c.classList.remove("out");
    opened = null;
    await wait(420);
    busy = false;
  }
  if (matchMedia("(hover: none)").matches) deck.querySelectorAll(".face-end span").forEach((n) => { n.textContent = "Tap the card to put it back"; });
  seat();
  deck.addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (!c || busy || e.target.closest("a")) return;
    if (opened) closeCard(); else openCard(c);
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && opened && !busy) closeCard(); });
  addEventListener("resize", () => { if (opened) sizeOpen(opened); });

  /* ---------------------------------------------------------- run */
  let last = performance.now(), lastY = -1, force = true;
  function frame(now) {
    const t = now / 1000, dt = Math.min(0.5, (now - last) / 1000), moved = scrollY !== lastY;
    lastY = scrollY;
    if (swap) { swap(); swap = false; force = true; }
    if (metal && (!calm.matches || moved || force)) metal.draw(calm.matches ? 4 : t, view(t, dt));
    if (moved || force) paintLit();
    force = false;
    last = now;
    requestAnimationFrame(frame);
  }

  let rs = 0;
  addEventListener("resize", () => {
    clearTimeout(rs);
    rs = setTimeout(() => { metal && metal.fit(); fitName(); force = true; }, 120);
  });

  const intro = !calm.matches && scrollY < 40;
  if (intro) { name.classList.add("hold"); front.classList.add("hold"); hero.classList.add("hold"); }
  const begin = () => {
    fitName();
    force = true;
    if (intro) { born = performance.now() / 1000; setTimeout(() => { name.classList.remove("hold"); front.classList.remove("hold"); hero.classList.remove("hold"); }, 60); }
  };
  Promise.race([document.fonts.load('700 100px "Host Grotesk"'), new Promise((r) => setTimeout(r, 1200))]).then(begin, begin);
  requestAnimationFrame(frame);
})();
