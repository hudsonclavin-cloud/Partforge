import sys
p = sys.argv[1] if len(sys.argv)>1 else 'vis.html'
s = open(p, encoding='utf-8').read(); E=[]
def sub(f, r, label):
    global s
    c = s.count(f)
    if c != 1: print(f'ABORT: "{label}" matched {c} times, expected 1'); sys.exit(1)
    s = s.replace(f, r); E.append(label)

# 1) capture the viewport from several angles as JPEGs
sub("""/* ---- measure tool ---- */""",
"""/* Render the current part from several angles and return small JPEGs.
   This is what lets the designer SEE its own output instead of working blind. */
function captureViews(){
  if(!renderer || !camera) return [];
  const saveP = camera.position.clone(), saveT = controls.target.clone();
  const span = Math.max(lastFit.span, 20), h = lastFit.height;
  const d = span * 1.9;
  const poses = [
    { name:'front', p:[0, h*0.55, d] },
    { name:'three-quarter', p:[d*0.72, h*0.75, d*0.72] },
    { name:'side', p:[d, h*0.55, 0.001] },
  ];
  const shots = [];
  for(const pose of poses){
    camera.position.set(pose.p[0], pose.p[1], pose.p[2]);
    controls.target.set(0, h/2, 0);
    camera.lookAt(0, h/2, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);                     // toDataURL must follow render synchronously
    const full = renderer.domElement.toDataURL('image/jpeg', 0.8);
    shots.push({ name: pose.name, url: full });
  }
  camera.position.copy(saveP); controls.target.copy(saveT);
  renderer.render(scene, camera);
  return shots;
}
/* downscale a data URL so three views don't blow up the token bill */
function shrink(dataUrl, maxSide){
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const sc = Math.min(1, maxSide / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width*sc); c.height = Math.round(im.height*sc);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    im.onerror = () => res(null);
    im.src = dataUrl;
  });
}

/* ---- measure tool ---- */""",
'captureViews + shrink')

# 2) remember what was asked, so the critique can judge against it
sub("""let currentCode = '', currentMesh = null, currentManifest = null, busy = false, qaAsked = false;""",
"""let currentCode = '', currentMesh = null, currentManifest = null, busy = false, qaAsked = false;
let lastRequest = '';   // the user's own words, for the look-at-it-and-fix-it pass""",
'lastRequest state')
sub("""    const promptText = p || 'Design a useful part based on the attached photo(s).';
    if(p) pushPromptHistory(p);""",
"""    const promptText = p || 'Design a useful part based on the attached photo(s).';
    if(!isRefine) lastRequest = promptText;
    if(p) pushPromptHistory(p);""",
'record request')

# 3) the look-and-fix pass
sub("""$('btnReview').onclick = async () => {""",
"""/* Look at the render, compare it to what was asked, and revise. The single
   biggest quality lever: until now the model wrote geometry it could never see. */
async function improveByLooking(){
  if(!currentCode || busy) return;
  if(!settings.key){ toast('Improve needs an API key (⚙ Settings)'); return; }
  if(aiBusy) return;
  aiBusy = true;
  const out = $('reviewOut');
  out.style.display = 'block'; out.textContent = 'Looking at the render…';
  try {
    const shots = captureViews();
    if(!shots.length) throw new Error('No render to look at yet.');
    const datas = [];
    for(const sh of shots){ const d = await shrink(sh.url, 640); if(d) datas.push({ name: sh.name, data: d }); }
    if(!datas.length) throw new Error('Could not capture the viewport.');
    const a = lastAnalysis;
    const facts = a ? `Measured: ${a.size.map(v=>v.toFixed(1)).join(' × ')} mm, `
      + `${a.overhangPct.toFixed(1)}% of the surface overhangs past 45°, `
      + `footprint ${a.footprint.toFixed(1)} cm², height/width ratio ${a.aspect.toFixed(1)}`
      + (lastConnInfo ? `, ${lastConnInfo.count} connected piece(s), ${lastConnInfo.floating} floating` : '') + '.' : '';
    const ask = `These are rendered views (front, three-quarter, side) of the part you just designed.\\n`
      + `The request was: "${lastRequest || 'see the code'}"\\n${facts}\\n\\n`
      + `Look at the images critically and judge them against the request:\\n`
      + `- Does the silhouette actually read as what was asked for? Proportions, stance, character?\\n`
      + `- Is anything misplaced, missing, lumpy, or accidentally flat? Compare the side view to the front: a figure should have real depth, not be a slab.\\n`
      + `- Do the measured numbers reveal a print problem (overhangs, tippy footprint, oversized bounding box)?\\n\\n`
      + `Then return the FULL corrected OpenSCAD file in the usual contract. Keep what works; change what doesn't. `
      + `Begin the file with a // NOTE: line naming the top 2–3 things you changed and why.`;
    const content = [
      ...datas.map(d => P().image({ mime:'image/jpeg', data:d.data })),
      { type:'text', text: ask },
    ];
    chat = []; qaAsked = true;               // fresh turn; never let it ask questions here
    setOverlay(true, `<span class="big">Looking at the render and revising</span>${escapeHtml(settings.model)}`, {cancel:false});
    const text = await callClaude(content);
    const code = parseCode(text);
    if(!code) throw new Error('The model replied without code.');
    const note = (code.match(/^\\/\\/\\s*NOTE:\\s*(.*)$/m) || [])[1] || 'revised';
    out.textContent = '↻ ' + note;
    aiBusy = false;                          // runCode has its own busy guard
    await runCode(code);
    pushHistory('ai', 'looked at it and revised');
  } catch(err){
    out.textContent = 'Improve failed: ' + String(err.message || err);
    if(currentMesh) setOverlay(false); else showRenderError(err);
  } finally { aiBusy = false; }
}
$('btnImprove').onclick = improveByLooking;
$('btnReview').onclick = async () => {""",
'improveByLooking')

# 4) the button
sub("""            <button class="btn small" id="btnReview" title="AI design review (uses API)">🔍 Review</button>""",
"""            <button class="btn small" id="btnImprove" title="Show the model its own render and let it fix what looks wrong (uses API)">✨ Look &amp; fix</button>
            <button class="btn small" id="btnReview" title="AI design review (uses API)">🔍 Review</button>""",
'button')

# 5) figures: depth and print pose were the two things the guidance missed
sub("""- Budget ~40 hull operations maximum so it still compiles in a browser.""",
"""- DEPTH: a figure must be a solid body, not a slab. Front-to-back depth through the torso should be at least 60% of the shoulder width, and limbs should be round in cross-section (hull of spheres), never flat plates. Check your own numbers: if the Y dimension is under half the X dimension, the figure is a cookie cutter — fix it.
- POSE FOR PRINTING: arms held straight out sideways are horizontal cantilevers that need scaffolding under their whole length. Prefer arms down, bent, or held close to the body. If the request really implies outstretched arms, either angle them 45° downward or state in a NOTE that supports are required and why you chose the pose anyway.
- Keep the bounding box close to the stated size: a figure described as "80 mm tall" should not be 100 mm wide.
- Budget ~40 hull operations maximum so it still compiles in a browser.""",
'prompt: depth + pose')

# 6) test hook
sub("""  setSection, setMeasure, toggleDimsOverlay, applyMeshOp, reportText, shareUrl, viewPreset,""",
"""  setSection, setMeasure, toggleDimsOverlay, applyMeshOp, reportText, shareUrl, viewPreset,
  captureViews, improveByLooking,""",
'test hook')

open(p,'w',encoding='utf-8').write(s)
print('applied', len(E), 'edits:'); [print('  -', e) for e in E]
