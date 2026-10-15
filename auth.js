'use strict';
(function(){
 const URL=['https://nfemozpmqfgedxfuzamm','supabase.co'].join('.'), KEY='sb_publishable_2Fjo5yAlInqT8UUGn8axUg_iK8Wcy7E';
 if(!window.supabase?.createClient){console.error('Supabase JS indisponível');return;}
 const client=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 window.BHAuth={
  client,
  async session(){return (await client.auth.getSession()).data.session;},
  async token(){return (await this.session())?.access_token||null;},
  async logout(){await client.auth.signOut();location.href='conta.html';}
 };
})();
