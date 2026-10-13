(()=>{'use strict';const $=id=>document.getElementById(id);let token='';const brl=x=>Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const set=(id,v)=>$(id).textContent=v;
async function refresh(){
 if(!token)throw Error('Entre na sua conta primeiro.');
 const r=await fetch('/api/admin/pix/summary',{headers:{Authorization:'Bearer '+token}});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Falha na consulta.');
 set('paid',brl(d.totals.paid));set('pending',brl(d.totals.pending));set('paidCount',d.totals.paidCount);set('pendingCount',d.totals.pendingCount);
 const tbody=$('transactions');tbody.replaceChildren();
 for(const x of d.transactions){const tr=document.createElement('tr');for(const value of [x.created_at?new Date(x.created_at).toLocaleString('pt-BR'):'—',x.category||'—',x.customer_name||x.plan||'—',brl(x.amount),x.status||'—']){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}tbody.appendChild(tr);}
 if(!d.transactions.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Nenhuma movimentação encontrada.';tr.appendChild(td);tbody.appendChild(tr);}
 set('notice','Dados atualizados. '+(d.note||''));
}
$('login').addEventListener('submit',async e=>{e.preventDefault();set('notice','Autenticando...');try{
 const url=window.BH_SUPABASE_URL||'',key=window.BH_SUPABASE_ANON_KEY||'';
 if(!url||!key)throw Error('Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo admin-pix-config.js.');
 const r=await fetch(url.replace(/\/$/,'')+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})});
 const d=await r.json();if(!r.ok||!d.access_token)throw Error('Credenciais inválidas ou autenticação indisponível.');
 token=d.access_token;$('password').value='';await refresh();$('refresh').hidden=false;
 }catch(err){token='';set('notice',err.message);}});
$('refresh').addEventListener('click',()=>refresh().catch(e=>set('notice',e.message)));
})();