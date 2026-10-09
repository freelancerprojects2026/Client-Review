const status=document.querySelector('.review-status');
document.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('.zoom-region').forEach(region=>{const board=region.firstElementChild,scale=b.dataset.zoom==='fit'?Math.min(1,region.clientWidth/board.offsetWidth):Number(b.dataset.zoom);board.style.transform=`scale(${scale})`;region.style.height=`${board.offsetHeight*scale+8}px`;});
 document.querySelectorAll('[data-zoom]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
}));
document.querySelectorAll('.role-choice').forEach(screen=>{
 screen.querySelectorAll('.role-card').forEach(button=>button.addEventListener('click',()=>{
  screen.querySelectorAll('.role-card').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));screen.dataset.demoSelection=button.dataset.role;screen.querySelector('.choice-continue').disabled=false;
  status.textContent=`${button.dataset.role==='player'?'Player':'Scout'} path selected for preview only; no account role or Scout authorization is assigned.`;
 }));
 screen.querySelector('.choice-continue').addEventListener('click',()=>{
  const entry=screen.closest('.flow-row')?.querySelector('.entry'),role=screen.dataset.demoSelection;
  if(entry){entry.querySelectorAll('.role-option').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.audience===role)));entry.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center',inline:'center'});}
  status.textContent=`${role==='player'?'Player':'Scout'} authentication presentation preview; authentication is not connected and permissions are unchanged.`;
 });
 screen.querySelector('.guest-action').addEventListener('click',()=>{status.textContent='Continue as Guest: visual preview only.';});
});
document.querySelectorAll('.entry').forEach(screen=>{
 screen.querySelectorAll('.role-option').forEach(button=>button.addEventListener('click',()=>{screen.querySelectorAll('.role-option').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));status.textContent='Authentication audience preview only; account roles and Scout verification are unchanged.';}));
 screen.querySelector('.eye-toggle').addEventListener('click',()=>{const input=screen.querySelector('.password-input'),show=input.type==='password';input.type=show?'text':'password';screen.querySelector('.eye-toggle').setAttribute('aria-label',show?'Hide password':'Show password');});
 screen.querySelector('form').addEventListener('submit',e=>{e.preventDefault();status.textContent='Review-only authentication presentation; no request or simulated sign-in success.';});
});
document.querySelectorAll('[data-review-action]').forEach(b=>b.addEventListener('click',()=>{status.textContent=`${b.dataset.reviewAction}: visual review control only; no downstream flow is connected.`;}));
