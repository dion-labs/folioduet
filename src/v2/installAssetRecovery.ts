import { notifyAssetFailure } from './assetRecovery';

// Never reload automatically: a PDF import or unsaved comparison may be open.
window.addEventListener('vite:preloadError', () => notifyAssetFailure());
window.addEventListener('folioduet:asset-failure', () => {
  if (document.getElementById('asset-recovery-notice')) return;
  const notice = document.createElement('aside');
  notice.id = 'asset-recovery-notice';
  notice.setAttribute('role', 'alert');
  Object.assign(notice.style, {position:'fixed',bottom:'16px',left:'16px',right:'16px',zIndex:'10000',background:'#fff4e5',color:'#272c25',padding:'18px',border:'1px solid #b86643',borderRadius:'12px',boxShadow:'0 4px 24px #0005',font:'14px/1.5 system-ui'});
  const message = document.createElement('p');
  message.textContent = 'Some app files could not load. You may be offline or this tab may need the latest version. Your saved library is retained. Finish any imports and save any comparison review before refreshing; unsaved selections may need to be opened again.';
  message.style.margin = '0 0 12px';
  const refresh = document.createElement('button');
  refresh.textContent = 'Refresh app…';
  refresh.onclick = () => {
    if (window.confirm('Have imports finished and any comparison review been saved? Refreshing keeps saved library data, but clears unsaved work on this page.')) window.location.reload();
  };
  const dismiss = document.createElement('button');
  dismiss.textContent = 'Keep working';
  dismiss.onclick = () => notice.remove();
  for (const button of [refresh,dismiss]) Object.assign(button.style,{marginRight:'12px',padding:'8px 14px',cursor:'pointer',color:'#272c25',background:'#fff',border:'1px solid #8b9386',borderRadius:'6px'});
  notice.append(message,refresh,dismiss);
  document.body.append(notice);
});
