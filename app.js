
(() => {
  const cfg = window.MV_CONFIG || {};
  const $ = id => document.getElementById(id);
  $("year").textContent = new Date().getFullYear();

  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") &&
    !cfg.SUPABASE_ANON_KEY.includes("PASTE_");

  let sb = null, session = null, profile = null;
  let publicTracks = [];
  let rankings = [];

  if (configured && window.supabase) {
    sb = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );
  } else {
    $("accountStatus").textContent =
      "Supabase sinakonzedwebe. Onani config.js.";
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 4500);
  }

  function money(n) {
    return "MK " + Number(n || 0).toLocaleString("en-US");
  }

  function safe(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function setText(id, value) {
    if ($(id)) $(id).textContent = value;
  }

  function setHTML(id, value) {
    if ($(id)) $(id).innerHTML = value;
  }

  function visitorId() {
    let id = localStorage.getItem("mv_visitor_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("mv_visitor_id", id);
    }
    return id;
  }

  async function recordEvent(trackId, type) {
    if (!sb) return;

    const { error } = await sb.rpc("record_track_event", {
      p_track_id: trackId,
      p_event_type: type,
      p_visitor_id: visitorId()
    });

    if (error) console.error("Event error:", error.message);
  }

  function showTab(id) {
    ["loginPanel", "registerPanel"].forEach(x => {
      if ($(x)) $(x).classList.toggle("hidden", x !== id);
    });

    document.querySelectorAll(".tab").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === id);
    });
  }

  document.querySelectorAll(".tab").forEach(b => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });

  async function loadProfile() {
    if (!sb || !session) return;

    $("accountStatus").textContent = "Tikukonzekera account yanu...";

    const { data, error } = await sb.from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !data) {
      toast(error?.message || "Profile sinapezeke.");
      return;
    }

    profile = data;

    $("accountStatus").textContent =
      `Logged in as ${profile.artist_name || session.user.email}`;

    $("artistDashboard").classList.remove("hidden");
    $("logoutBtn").classList.remove("hidden");

    if (profile.role === "admin") {
      $("adminDashboard").classList.remove("hidden");
      await loadAdmin();
    } else {
      $("adminDashboard").classList.add("hidden");
    }

    await loadMyTracks();
  }

  async function authChanged(s) {
    session = s;

    if (s) {
      await loadProfile();
    } else {
      profile = null;
      $("artistDashboard").classList.add("hidden");
      $("adminDashboard").classList.add("hidden");
      $("logoutBtn").classList.add("hidden");
      $("accountStatus").textContent =
        "Lowani kapena pangani account kuti mugwiritse ntchito Artist Studio.";
    }
  }

  if (sb) {
    sb.auth.getSession().then(({ data, error }) => {
      if (error) return toast(error.message);
      authChanged(data.session);
    });

    sb.auth.onAuthStateChange((_event, s) => {
      Promise.resolve().then(() => authChanged(s));
    });
  }

  $("registerPanel").addEventListener("submit", async e => {
    e.preventDefault();
    if (!sb) return toast("Ikani Supabase settings mu config.js.");

    const name = $("artistName").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { artist_name: name } }
    });

    if (error) return toast(error.message);

    toast(data.session
      ? "Account yapangidwa."
      : "Account yapangidwa. Yang'anani email yanu.");
  });

  $("loginPanel").addEventListener("submit", async e => {
    e.preventDefault();
    if (!sb) return toast("Ikani Supabase settings mu config.js.");

    const { error } = await sb.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value
    });

    if (error) toast(error.message);
    else toast("Mwalowa bwino.");
  });

  $("logoutBtn").addEventListener("click", async () => {
    if (sb) await sb.auth.signOut();
  });

  async function uploadTo(bucket, file, path) {
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type
    });

    if (error) throw error;
    return path;
  }

  $("uploadForm").addEventListener("submit", async e => {
    e.preventDefault();

    if (!sb || !session || !profile) {
      return toast("Lowani kaye mu account yanu.");
    }

    const audio = $("audioFile").files[0];
    const cover = $("coverFile").files[0];

    if (!audio) return toast("Sankhani audio file.");
    if (audio.size > 25 * 1024 * 1024) {
      return toast("Audio iyenera kukhala yochepera 25 MB.");
    }
    if (cover && cover.size > 5 * 1024 * 1024) {
      return toast("Cover iyenera kukhala yochepera 5 MB.");
    }

    const ref = $("paymentReference").value.trim();
    if (!ref) return toast("Lowetsani payment reference.");

    const btn = e.submitter;
    btn.disabled = true;
    btn.textContent = "Submitting...";

    try {
      const id = crypto.randomUUID();
      const audioPath =
        `${session.user.id}/${id}/${audio.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      await uploadTo("music", audio, audioPath);

      let coverPath = null;

      if (cover) {
        coverPath =
          `${session.user.id}/${id}/${cover.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await uploadTo("covers", cover, coverPath);
      }

      const { data: track, error: trackErr } = await sb.from("tracks")
        .insert({
          id,
          artist_id: session.user.id,
          title: $("songTitle").value.trim(),
          genre: $("songGenre").value,
          audio_path: audioPath,
          cover_path: coverPath,
          status: "pending_payment"
        })
        .select()
        .single();

      if (trackErr) throw trackErr;

      const { error: payErr } = await sb.from("payment_requests")
        .insert({
          artist_id: session.user.id,
          track_id: track.id,
          amount_mwk: 3000,
          method: $("paymentMethod").value,
          transaction_reference: ref,
          status: "pending"
        });

      if (payErr) throw payErr;

      $("uploadMessage").textContent =
        "Zatumizidwa. Admin ayenera kutsimikizira payment.";

      $("uploadForm").reset();
      await loadMyTracks();
      toast("Upload request yaperekedwa.");

    } catch (err) {
      console.error(err);
      toast("Vuto: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit song & payment reference";
    }
  });

  async function loadMyTracks() {
    if (!sb || !session) return;

    const { data, error } = await sb.from("tracks")
      .select("*,payment_requests(status,method,transaction_reference)")
      .eq("artist_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) return toast(error.message);

    setHTML("myTracks", data.length
      ? data.map(t => `
        <article class="track-card">
          <h3>${safe(t.title)}</h3>
          <p>${safe(t.genre)} · ${safe(t.status)}</p>
          <p class="muted">Payment:
            ${safe(t.payment_requests?.[0]?.status || "pending")}
          </p>
        </article>
      `).join("")
      : '<p class="empty">Simunakweze nyimbo pano.</p>');

    await loadArtistStats(data);
  }

  async function loadArtistStats(tracks) {
    if (!session) return;

    const ids = tracks.map(t => t.id);

    setText("artistSongCount", tracks.length);

    if (!ids.length) {
      setText("artistViews", 0);
      setText("artistDownloads", 0);
      setText("artistComments", 0);
      setHTML("artistBestSongs", "Palibe nyimbo pano.");
      return;
    }

    const { data: events, error } = await sb.from("track_events")
      .select("track_id,event_type")
      .in("track_id", ids);

    if (error) {
      console.error(error.message);
      return;
    }

    const views = events.filter(x => x.event_type === "view").length;
    const downloads = events.filter(x => x.event_type === "download").length;

    setText("artistViews", views);
    setText("artistDownloads", downloads);

    const { data: comments } = await sb.from("comments")
      .select("id")
      .in("track_id", ids)
      .eq("status", "approved");

    setText("artistComments", comments?.length || 0);

    const counts = {};

    events.forEach(e => {
      if (!counts[e.track_id]) {
        counts[e.track_id] = { views: 0, downloads: 0 };
      }

      if (e.event_type === "view") counts[e.track_id].views++;
      if (e.event_type === "download") counts[e.track_id].downloads++;
    });

    const best = [...tracks].sort((a, b) =>
      (counts[b.id]?.views || 0) - (counts[a.id]?.views || 0)
    ).slice(0, 5);

    setHTML("artistBestSongs", best.map(t => `
      <p><b>${safe(t.title)}</b> —
      ${counts[t.id]?.views || 0} views</p>
    `).join(""));
  }

  async function loadComments(trackId) {
    const { data, error } = await sb.from("comments")
      .select("author_name,body,created_at")
      .eq("track_id", trackId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) return "";

    return data.map(c => `
      <p class="comment">
        <b>${safe(c.author_name)}</b>:
        ${safe(c.body)}
      </p>
    `).join("");
  }

  async function renderTrack(t) {
    const audio = sb.storage.from("music")
      .getPublicUrl(t.audio_path).data.publicUrl;

    const cover = t.cover_path
      ? sb.storage.from("covers").getPublicUrl(t.cover_path).data.publicUrl
      : null;

    const comments = await loadComments(t.id);

    return `
      <article class="track-card">
        <div class="cover">
          ${cover
            ? `<img src="${safe(cover)}" alt="Song cover">`
            : "MV"}
        </div>

        <h3>${safe(t.title)}</h3>

        <p class="muted">
          ${safe(t.profiles?.artist_name || "Malawian Artist")}
          · ${safe(t.genre)}
        </p>

        <audio controls preload="none"
          data-play-track="${t.id}"
          src="${safe(audio)}"></audio>

        <p>
          <a href="${safe(audio)}"
            target="_blank"
            rel="noopener"
            data-download-track="${t.id}">
            Download song
          </a>
        </p>

        <div class="comments">
          <h4>Comments</h4>
          ${comments || "<p>No approved comments yet.</p>"}

          <form class="comment-form" data-comment-track="${t.id}">
            <input name="author" placeholder="Your name" required maxlength="60">
            <textarea name="body" placeholder="Write a comment..." required maxlength="500"></textarea>
            <button type="submit">Send comment</button>
          </form>
        </div>
      </article>
    `;
  }

  async function loadPublicTracks() {
    if (!sb) {
      setHTML("trackList", "Music library idzaoneka Supabase ikalumikizidwa.");
      return;
    }

    const { data, error } = await sb.from("tracks")
      .select("id,title,genre,artist_id,audio_path,cover_path,created_at,profiles(artist_name)")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      setHTML("trackList", "Sitingathe kutenga nyimbo panopa.");
      return;
    }

    publicTracks = data || [];

    if (!publicTracks.length) {
      setHTML("trackList", "Palibe nyimbo zovomerezeka pano.");
      setHTML("top10List", "Palibe nyimbo pano.");
      setHTML("trendingList", "Palibe nyimbo pano.");
      return;
    }

    const cards = await Promise.all(publicTracks.map(renderTrack));
    setHTML("trackList", cards.join(""));

    await loadRankings();
  }

  async function loadRankings() {
    const { data, error } = await sb.rpc("get_public_track_rankings");

    if (error) {
      console.error("Rankings error:", error.message);
      return;
    }

    rankings = data || [];

    const ranked = publicTracks.map(t => {
      const stats = rankings.find(r => r.track_id === t.id);
      return {
        ...t,
        views: Number(stats?.views || 0),
        downloads: Number(stats?.downloads || 0)
      };
    });

    const top = [...ranked]
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    const trending = [...ranked]
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    setHTML("top10List", top.map((t, i) => `
      <p>${i + 1}. <b>${safe(t.title)}</b>
      — ${t.views} views</p>
    `).join("") || "Palibe nyimbo pano.");

    setHTML("trendingList", trending.map(t => `
      <p><b>${safe(t.title)}</b> — ${t.views} views</p>
    `).join("") || "Palibe trending songs pano.");
  }

  $("trackList").addEventListener("play", () => {});
  $("trackList").addEventListener("click", async e => {
    const download = e.target.closest("[data-download-track]");

    if (download) {
      recordEvent(download.dataset.downloadTrack, "download");
    }
  });

  $("trackList").addEventListener("play", e => {
    const audio = e.target.closest("audio[data-play-track]");
    if (audio && !audio.dataset.counted) {
      audio.dataset.counted = "yes";
      recordEvent(audio.dataset.playTrack, "view");
    }
  }, true);

  $("trackList").addEventListener("submit", async e => {
    const form = e.target.closest(".comment-form");
    if (!form) return;

    e.preventDefault();

    const trackId = form.dataset.commentTrack;
    const author = form.elements.author.value.trim();
    const body = form.elements.body.value.trim();

    if (!author || !body) return;

    const button = form.querySelector("button");
    button.disabled = true;

    const { error } = await sb.from("comments").insert({
      track_id: trackId,
      author_name: author,
      body,
      status: "pending"
    });

    button.disabled = false;

    if (error) {
      toast("Comment error: " + error.message);
    } else {
      form.reset();
      toast("Comment yatumizidwa. Ikuyembekezera kuvomerezedwa ndi Admin.");
    }
  });

  $("refreshTracks").addEventListener("click", loadPublicTracks);

  async function loadAdmin() {
    if (!sb || !profile || profile.role !== "admin") return;

    const { data: payments, error } = await sb.from("payment_requests")
      .select("*,tracks(title),profiles(artist_name,email)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      setHTML("adminPayments", "Admin data sinapezeke.");
      return;
    }

    setHTML("adminPayments", payments.length
      ? payments.map(p => `
        <div class="admin-item">
          <div>
            <b>${safe(p.profiles?.artist_name || p.profiles?.email || "Artist")}
            — ${safe(p.tracks?.title || "Song")}</b>
            <p>${money(p.amount_mwk)} · ${safe(p.method)}
            · Ref: ${safe(p.transaction_reference)}</p>
          </div>
          <div class="admin-actions">
            <button class="approve" data-payment="${p.id}"
              data-track="${p.track_id}">Verify & approve</button>
            <button class="reject" data-payment="${p.id}"
              data-track="${p.track_id}">Reject</button>
          </div>
        </div>
      `).join("")
      : '<p class="empty">Palibe payment request yodikirira.</p>');

    const { data: tracks } = await sb.from("tracks")
      .select("*,profiles(artist_name)")
      .eq("status", "pending_payment")
      .order("created_at", { ascending: true });

    setHTML("adminTracks", tracks?.length
      ? tracks.map(t => `
        <div class="admin-item">
          <b>${safe(t.title)}</b>
          <p>${safe(t.profiles?.artist_name || "Artist")}
          · ${safe(t.genre)}</p>
          <span>Waiting for payment verification</span>
        </div>
      `).join("")
      : '<p class="empty">Palibe nyimbo zodikirira.</p>');

    await loadAdminStats();
    await loadAdminComments();
  }

  async function loadAdminStats() {
    const [artists, songs, views, downloads, pending, comments] =
      await Promise.all([
        sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "artist"),
        sb.from("tracks").select("id", { count: "exact", head: true }),
        sb.from("track_events").select("id", { count: "exact", head: true }).eq("event_type", "view"),
        sb.from("track_events").select("id", { count: "exact", head: true }).eq("event_type", "download"),
        sb.from("payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        sb.from("comments").select("id", { count: "exact", head: true }).eq("status", "pending")
      ]);

    setText("adminArtistCount", artists.count ?? "—");
    setText("adminSongCount", songs.count ?? "—");
    setText("adminViews", views.count ?? "—");
    setText("adminDownloads", downloads.count ?? "—");
    setText("adminPendingPayments", pending.count ?? "—");
    setText("adminCommentCount", comments.count ?? "—");

    const { data } = await sb.rpc("get_public_track_rankings");

    const best = (data || [])
      .map(r => ({
        ...r,
        track: publicTracks.find(t => t.id === r.track_id)
      }))
      .filter(r => r.track)
      .sort((a, b) => Number(b.views) - Number(a.views))
      .slice(0, 10);

    setHTML("adminTopSongs", best.map((r, i) => `
      <p>${i + 1}. <b>${safe(r.track.title)}</b>
      — ${r.views} views, ${r.downloads} downloads</p>
    `).join("") || "Palibe nyimbo pano.");
  }

  async function loadAdminComments() {
    const { data, error } = await sb.from("comments")
      .select("id,track_id,author_name,body,created_at,tracks(title)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      setHTML("adminComments", "Comments sinapezeke.");
      return;
    }

    setHTML("adminComments", data.length
      ? data.map(c => `
        <div class="admin-item">
          <div>
            <b>${safe(c.author_name)} — ${safe(c.tracks?.title || "Song")}</b>
            <p>${safe(c.body)}</p>
          </div>
          <div class="admin-actions">
            <button data-comment-approve="${c.id}">Approve</button>
            <button data-comment-reject="${c.id}">Reject</button>
          </div>
        </div>
      `).join("")
      : '<p class="empty">Palibe comments zodikirira.</p>');
  }

  $("adminDashboard").addEventListener("click", async e => {
    const commentApprove = e.target.closest("[data-comment-approve]");
    const commentReject = e.target.closest("[data-comment-reject]");

    if (commentApprove || commentReject) {
      const button = commentApprove || commentReject;
      const id = button.dataset.commentApprove || button.dataset.commentReject;
      const status = commentApprove ? "approved" : "rejected";

      button.disabled = true;

      const { error } = await sb.from("comments")
        .update({ status })
        .eq("id", id);

      if (error) {
        button.disabled = false;
        return toast(error.message);
      }

      toast("Comment yasinthidwa.");
      await loadAdminComments();
      return;
    }

    const b = e.target.closest("button[data-payment]");
    if (!b || !sb) return;

    const approve = b.classList.contains("approve");
    const paymentId = b.dataset.payment;
    const trackId = b.dataset.track;

    if (approve && !confirm(
      "Mwayang'ana account yanu ndipo mwatsimikiza kuti 
