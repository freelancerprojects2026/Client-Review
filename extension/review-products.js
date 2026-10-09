
const productStatus=document.querySelector('.extension-status');
function announce(text){productStatus.textContent=text;}
document.querySelectorAll('.product-screen').forEach(screen=>{
 screen.querySelectorAll('[data-product-target]').forEach(button=>button.addEventListener('click',()=>{
  const target=document.querySelector(`[data-extension-frame="${screen.dataset.identity}-${screen.dataset.palette}-${button.dataset.productTarget}"] .product-screen`);
  if(target){target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center',inline:'center'});announce('Presentation navigation only; no authenticated route or permission is implemented.');}
  else announce(`${button.textContent.trim()}: visual preview only.`);
 }));
 screen.querySelectorAll('[data-product-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.productAction;
  if(action==='For You feed'||action==='Rising feed'){
   screen.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));announce(`${action}: selected tab presentation only; visual preview only.`);return;
  }
  if(button.hasAttribute('aria-pressed')){const next=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(next));announce(`${action}: ${next?'selected':'unselected'} state preview only; no engagement or saved data is persisted.`);return;}
  if(action==='Return to discovery'){const target=document.querySelector(`[data-extension-frame="${screen.dataset.identity}-${screen.dataset.palette}-discovery"]`);target?.scrollIntoView({behavior:'instant',block:'center'});announce('Discovery presentation sample only.');return;}
  if(action==='Admin-mediated Contact Request'){announce('Contact requests are coordinated by Admin. Visual preview only; no request is sent.');return;}
  if(action==='Feed Player profile'){announce('Player Profile: visual preview only.');return;}
  announce(`${action}: review affordance only; no results, playback, external share or downstream behavior is simulated.`);
 }));
});
