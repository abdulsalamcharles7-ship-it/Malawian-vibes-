(() => {
  const cfg = window.MV_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  $("year").textContent = new Date().getFullYear();
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") && !cfg.SUPABASE_ANON_KEY.includes("PASTE_");
  let sb = null, session = null, profile = null;
  if (configured && window.supabase) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  else $("accountStatus").textContent = "Supabase sinakonzedwebe. Tsatirani README kuti mulowetse project URL ndi anon key.";

  function toast(msg){ const el=$("toast"); el.textContent=msg; el.classList.remove("hidden"); setTimeout(()=>el.classList.add("hidden"),4500); }
  function money(n){return "MK " + Number(n).toLocaleString("en-US");}
  function safe(s){return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function showTab(id){["loginPanel","registerPanel"].forEach(x=>$(x).classList.toggle("hidden",x!==id));document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===id));}
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));

  async function loadProfile(){
    if(!sb || !session) return;
    $("accountStatus").textContent = "Tikukonzekera account yanu...";
    const {data,error}=await sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
    if(error){
      console.error("Profile lookup failed:",error);
      $("accountStatus").textContent = "Login yachitika koma profile sinatengedwe. Onani Supabase SQL/RLS policies.";
      toast("Profile error: "+error.message);
      return;
    }
    if(!data){
      $("accountStatus").textContent = "Account ilipo koma profile palibe. Thamangitsani SQL ya supabase/schema.sql mu Supabase SQL Editor.";
      toast("Profile sinapangidwe. Onani signup trigger mu Supabase.");
      return;
    }
    profile=data;
    $("accountStatus").textContent=`Logged in as ${profile.artist_name || session.user.email}`;
    $("artistDashboard").classList.remove("hidden");
    $("logoutBtn").classList.remove("hidden");
    if(profile.role==="admin"){
      $("adminDashboard").classList.remove("hidden");
      await loadAdmin();
    } else {
      $("adminDashboard").classList.add("hidden");
    }
    await loadMyTracks();
  }
  async function authChanged(s){
    session=s;
    if(s) await loadProfile();
    else {
      profile=null;
      $("artistDashboard").classList.add("hidden");
      $("adminDashboard").classList.add("hidden");
      $("logoutBtn").classList.add("hidden");
      $("accountStatus").textContent="Lowani kapena pangani account kuti mugwiritse ntchito Artist Studio.";
    }
  }
  if(sb){
    sb.auth.getSession().then(({data,error})=>{
      if(error){console.error(error);toast("Session error: "+error.message);return;}
      authChanged(data.session);
    });
    // Defer Supabase queries until the auth callback has returned.
    sb.auth.onAuthStateChange((_event,s)=>{
      Promise.resolve().then(()=>authChanged(s));
    });
  }

  $("registerPanel").addEventListener("submit",async e=>{
    e.preventDefault(); if(!sb)return toast("Ikani Supabase settings mu config.js kaye.");
    const name=$("artistName").value.trim(),email=$("registerEmail").value.trim(),password=$("registerPassword").value;
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{artist_name:name}}});
    if(error)return toast(error.message);
    toast(data.session?"Account yapangidwa.":"Account yapangidwa. Yang'anani email kuti mutsimikizire, ngati email confirmation yayatsidwa.");
  });
  $("loginPanel").addEventListener("submit",async e=>{
    e.preventDefault(); if(!sb)return toast("Ikani Supabase settings mu config.js kaye.");
    const {error}=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
    if(error)toast(error.message); else toast("Mwalowa bwino. Tikutsegula dashboard...");
  });
  $("logoutBtn").addEventListener("click",async()=>{if(sb)await sb.auth.signOut();});

  async function uploadTo(bucket,file,path){
    const {error}=await sb.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
    if(error)throw error;
    return path;
  }
  $("uploadForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!sb || !session || !profile)return toast("Lowani kaye mu account yanu.");
    const audio=$("audioFile").files[0], cover=$("coverFile").files[0];
    if(!audio)return toast("Sankhani audio file.");
    if(audio.size>25*1024*1024)return toast("Audio file iyenera kukhala yochepera 25 MB.");
    if(cover && cover.size>5*1024*1024)return toast("Cover iyenera kukhala yochepera 5 MB.");
    const ref=$("paymentReference").value.trim();
    if(!ref)return toast("Lowetsani payment reference.");
    const btn=e.submitter;btn.disabled=true;btn.textContent="Submitting...";
    try{
      const id=crypto.randomUUID(), audioPath=`${session.user.id}/${id}/${audio.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      await uploadTo("music",audio,audioPath);
      let coverPath=null;
      if(cover){coverPath=`${session.user.id}/${id}/${cover.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;await uploadTo("covers",cover,coverPath);}
      const {data:track,error:trackErr}=await sb.from("tracks").insert({
        id,artist_id:session.user.id,title:$("songTitle").value.trim(),genre:$("songGenre").value,
        audio_path:audioPath,cover_path:coverPath,status:"pending_payment"
      }).select().single();
      if(trackErr)throw trackErr;
      const {error:payErr}=await sb.from("payment_requests").insert({
        artist_id:session.user.id,track_id:track.id,amount_mwk:3000,
        method:$("paymentMethod").value,transaction_reference:ref,status:"pending"
      });
      if(payErr)throw payErr;
      $("uploadMessage").textContent="Zatumizidwa. Admin ayenera kutsimikizira payment asanavomereze nyimboyi.";
      $("uploadForm").reset();await loadMyTracks();toast("Upload request yaperekedwa.");
    }catch(err){console.error(err);toast("Vuto: "+(err.message||"try again"));}
    finally{btn.disabled=false;btn.textContent="Submit song & payment reference";}
  });

  async function loadMyTracks(){
    if(!sb||!session)return;
    const {data,error}=await sb.from("tracks").select("*,payment_requests(status,method,transaction_reference)").eq("artist_id",session.user.id).order("created_at",{ascending:false});
    if(error)return;
    $("myTracks").innerHTML=data.length?data.map(t=>`<article class="track-card"><h3>${safe(t.title)}</h3><p>${safe(t.genre)} · ${safe(t.status)}</p><p class="muted">Payment: ${safe(t.payment_requests?.[0]?.status||"pending")}</p></article>`).join(""):'<p class="empty">Simunakweze nyimbo pano.</p>';
  }
  async function loadPublicTracks(){
    if(!sb){$("trackList").innerHTML='<p class="empty">Music library idzaoneka Supabase ikalumikizidwa.</p>';return;}
    const {data,error}=await sb.from("tracks").select("id,title,genre,artist_id,audio_path,cover_path,profiles(artist_name)").eq("status","published").order("created_at",{ascending:false});
    if(error){$("trackList").innerHTML='<p class="empty">Sitingathe kutenga nyimbo panopa.</p>';return;}
    if(!data.length){$("trackList").innerHTML='<p class="empty">Palibe nyimbo zovomerezeka pano. Bweraninso posachedwa!</p>';return;}
    $("trackList").innerHTML=data.map(t=>{
      const audio=sb.storage.from("music").getPublicUrl(t.audio_path).data.publicUrl;
      const cover=t.cover_path?sb.storage.from("covers").getPublicUrl(t.cover_path).data.publicUrl:null;
      return `<article class="track-card"><div class="cover">${cover?`<img src="${safe(cover)}" alt="Cover for ${safe(t.title)}">`:"MV"}</div><h3>${safe(t.title)}</h3><p class="muted">${safe(t.profiles?.artist_name||"Malawian Artist")} · ${safe(t.genre)}</p><audio controls preload="none" src="${safe(audio)}"></audio></article>`;
    }).join("");
  }
  $("refreshTracks").addEventListener("click",loadPublicTracks);

  async function loadAdmin(){
    if(!sb||!profile||profile.role!=="admin")return;
    const {data:payments,error}=await sb.from("payment_requests").select("*,tracks(title),profiles(artist_name,email)").eq("status","pending").order("created_at",{ascending:true});
    if(error){$("adminPayments").innerHTML='<p class="empty">Admin data sinapezeke. Onani SQL policies.</p>';return;}
    $("adminPayments").innerHTML=payments.length?payments.map(p=>`<div class="admin-item"><div><b>${safe(p.profiles?.artist_name||p.profiles?.email||"Artist")} — ${safe(p.tracks?.title||"Song")}</b><p>${money(p.amount_mwk)} · ${safe(p.method)} · Ref: ${safe(p.transaction_reference)}</p></div><div class="admin-actions"><button class="approve" data-payment="${p.id}" data-track="${p.track_id}">Verify & approve</button><button class="reject" data-payment="${p.id}" data-track="${p.track_id}">Reject</button></div></div>`).join(""):'<p class="empty">Palibe payment request yodikirira.</p>';
    const {data:tracks}=await sb.from("tracks").select("*,profiles(artist_name)").eq("status","pending_payment").order("created_at",{ascending:true});
    $("adminTracks").innerHTML=tracks?.length?tracks.map(t=>`<div class="admin-item"><div><b>${safe(t.title)}</b><p>${safe(t.profiles?.artist_name||"Artist")} · ${safe(t.genre)}</p></div><span>Waiting for payment verification</span></div>`).join(""):'<p class="empty">Palibe nyimbo zina zodikirira.</p>';
  }
  $("adminDashboard").addEventListener("click",async e=>{
    const b=e.target.closest("button[data-payment]");if(!b||!sb)return;
    const approve=b.classList.contains("approve"),paymentId=b.dataset.payment,trackId=b.dataset.track;
    if(approve && !confirm("Mwayang'ana account yanu ndipo mwatsimikiza kuti MK 3,000 yalowa?"))return;
    b.disabled=true;
    const {error:pErr}=await sb.from("payment_requests").update({status:approve?"verified":"rejected"}).eq("id",paymentId);
    if(pErr){b.disabled=false;return toast(pErr.message);}
    const {error:tErr}=await sb.from("tracks").update({status:approve?"published":"rejected"}).eq("id",trackId);
    if(tErr)return toast(tErr.message);
    toast(approve?"Payment verified; song published.":"Request rejected.");await loadAdmin();await loadPublicTracks();
  });
  loadPublicTracks();
})();