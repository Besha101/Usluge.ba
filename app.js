// ----- Firebase + App Logic (module) -----

// 1) UNESI SVOJ FIREBASE KONFIG OVDJE ↓  (Project settings » General » Your apps)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, serverTimestamp, query, where, orderBy, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const CATEGORIES = [
  { key:'elektricar', label:'Električar', icon:'bi-lightbulb' },
  { key:'vodoinstalater', label:'Vodoinstalater', icon:'bi-droplet' },
  { key:'gradjevina', label:'Građevinski radovi', icon:'bi-nut' },
  { key:'kucni', label:'Kućni majstor', icon:'bi-tools' },
  { key:'casovi', label:'Časovi', icon:'bi-easel' },
  { key:'ljepota', label:'Ljepota i zdravlje', icon:'bi-heart' },
  { key:'auto', label:'Auto mehanika', icon:'bi-car-front' },
  { key:'ciscenje', label:'Čišćenje', icon:'bi-broom' },
  { key:'prevodjenje', label:'Prevođenje', icon:'bi-chat-square-dots' },
  { key:'dostava', label:'Dostava', icon:'bi-truck' },
  { key:'ostalo', label:'Ostalo', icon:'bi-grid-3x3-gap' },
];

const APP = {
  pageSize: 9,
  state: { user:null, view:'home', cat:null, page:1, list:[], currentListing:null, currentThread:null },
  el: id=>document.getElementById(id),
  show(id){ document.querySelectorAll('[data-view]').forEach(v=>v.classList.add('hidden')); APP.el(id).classList.remove('hidden') },
  route(path){
    if(path==='/') { history.pushState({},'', '#/'); APP.show('view-home') }
    else if(path==='/login'){ history.pushState({},'','#/login'); APP.show('view-login') }
    else if(path==='/register'){ history.pushState({},'','#/register'); APP.show('view-register') }
    else if(path==='/new'){ if(!APP.state.user) return APP.route('/login'); history.pushState({},'','#/new'); APP.populateCats(); APP.show('view-new') }
    else if(path.startsWith('/category/')){ const cat=path.split('/')[2]; APP.openCategory(cat) }
    else if(path.startsWith('/listing/')){ const id=path.split('/')[2]; APP.openListing(id) }
    else if(path==='/profile'){ if(!APP.state.user) return APP.route('/login'); APP.openProfile(APP.state.user.uid) }
    else if(path.startsWith('/profile/')){ const uid=path.split('/')[2]; APP.openProfile(uid) }
    else if(path==='/inbox'){ if(!APP.state.user) return APP.route('/login'); APP.openInbox() }
  },
  searchFromNav(e){ e.preventDefault(); const q = APP.el('navSearch').value.trim(); if(!q) return; APP.route('/category/ostalo'); APP.el('f-q').value=q; APP.applyFilters(); },

  /* AUTH */
  async handleLogin(e){ e.preventDefault(); const email=APP.el('login-email').value, pass=APP.el('login-pass').value; await signInWithEmailAndPassword(auth,email,pass); },
  async handleRegister(e){ e.preventDefault(); const name=APP.el('reg-name').value, email=APP.el('reg-email').value, pass=APP.el('reg-pass').value; const {user}=await createUserWithEmailAndPassword(auth,email,pass); await updateProfile(user,{displayName:name}); await setDoc(doc(db,'profiles',user.uid),{ name, bio:'', city:'', phone:'', createdAt:serverTimestamp() }); APP.route('/profile'); },
  async logout(){ await signOut(auth) },

  /* HOME */
  renderCats(){
    const grid = APP.el('catGrid');
    grid.innerHTML = CATEGORIES.map(c=>`<div class="col"><a class="text-decoration-none text-reset" onclick="APP.route('/category/${c.key}')"><div class="cat-tile p-3 h-100 d-flex flex-column align-items-center text-center"><i class="bi ${c.icon} cat-icon"></i><div class="small mt-2">${c.label}</div></div></a></div>`).join('');
  },
  async renderFeatured(){
    const qs = query(collection(db,'listings'), orderBy('createdAt','desc'), limit(6));
    onSnapshot(qs, snap=>{
      const cont = APP.el('featured');
      cont.innerHTML = snap.docs.map(d=>APP.card({ id:d.id, ...d.data() })).join('');
    });
  },
  card(it){
    const starsFull = Math.floor(it.avgRating||0);
    const half = (it.avgRating||0) - starsFull >= .5;
    return `<div class="col-12 col-md-6 col-lg-4"><div class="card h-100"><img class="listing-thumb" src="${(it.photos&&it.photos[0])||'https://images.unsplash.com/photo-1581092921461-eab62e97a780?q=80&w=1200&auto=format&fit=crop'}" alt="${it.title}"><div class="card-body"><span class="badge rounded-pill badge-cat mb-2">${APP.catLabel(it.cat)}</span><h6 class="mb-1">${it.title}</h6><p class="text-muted small mb-2">${it.city||''}</p><div class="d-flex justify-content-between align-items-center"><span class="price">${it.poa?'Na upit':(it.price?it.price+' BAM':'')}</span><div class="rating small">${'<i class="bi bi-star-fill"></i>'.repeat(starsFull)}${half?'<i class="bi bi-star-half"></i>':''}${'<i class="bi bi-star"></i>'.repeat(5 - starsFull - (half?1:0))}<span class="text-muted">(${it.reviewsCount||0})</span></div></div><div class="mt-2 d-flex gap-2"><a class="btn btn-outline-primary btn-sm" onclick="APP.route('/listing/${it.id}')">Detalji</a><a class="btn btn-primary btn-sm text-white" onclick="APP.openSellerProfile('${it.ownerId}')">Profil</a></div></div></div></div>`
  },
  catLabel(key){ return CATEGORIES.find(c=>c.key===key)?.label || 'Kategorija' },

  /* CATEGORY */
  async openCategory(cat){ history.pushState({},'',`#/category/${cat}`); APP.show('view-category'); APP.el('catTitle').textContent=APP.catLabel(cat); APP.el('crumbCat').textContent=APP.catLabel(cat); APP.state.cat=cat; APP.applyFilters(); },
  async applyFilters(){
    const qStr = APP.el('f-q').value.toLowerCase();
    const min = parseFloat(APP.el('f-min').value)||null, max=parseFloat(APP.el('f-max').value)||null;
    const novo = APP.el('f-novo').checked, kor=APP.el('f-kor').checked; const sort=APP.el('f-sort').value;
    let qsRef = query(collection(db,'listings'), where('cat','==',APP.state.cat));
    const snap = await getDocs(qsRef); let list = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    if(qStr) list = list.filter(it=> (it.title||'').toLowerCase().includes(qStr) || (it.desc||'').toLowerCase().includes(qStr));
    if(min!==null) list = list.filter(it=> (it.price||0)>=min );
    if(max!==null) list = list.filter(it=> (it.price||0)<=max );
    if(novo && !kor) list = list.filter(it=> it.condition==='novo');
    if(kor && !novo) list = list.filter(it=> it.condition==='koristeno');
    switch(sort){
      case 'cheap': list.sort((a,b)=> (a.price||0)-(b.price||0)); break;
      case 'exp': list.sort((a,b)=> (b.price||0)-(a.price||0)); break;
      case 'rate': list.sort((a,b)=> (b.avgRating||0)-(a.avgRating||0)); break;
      default: list.sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    }
    APP.state.list=list; APP.renderPage(1);
  },
  renderPage(n){
    const per=APP.pageSize; const total=APP.state.list.length;
    const pages=Math.max(1,Math.ceil(total/per));
    const slice=APP.state.list.slice((n-1)*per, n*per);
    APP.el('listings').innerHTML=slice.map(APP.card).join('');
    APP.renderPager(n,pages);
    APP.el('resultCount').textContent=`Prikazano: ${slice.length} od ${total} oglasa`;
  },
  renderPager(p, pages){
    const ul=APP.el('pager');
    const li=(label,dis,t)=>`<li class="page-item ${dis?'disabled':''}"><a class="page-link" href="#" onclick="event.preventDefault(); ${!dis?`APP.renderPage(${t})`:''}">${label}</a></li>`;
    let html=li('Prethodna',p<=1,p-1);
    for(let i=1;i<=pages;i++){
      html+=`<li class="page-item ${i===p?'active':''}"><a class="page-link" href="#" onclick="event.preventDefault(); APP.renderPage(${i})">${i}</a></li>`
    }
    html+=li('Sljedeća',p>=pages,p+1);
    ul.innerHTML=html;
  },

  /* NEW LISTING */
  populateCats(){ APP.el('new-cat').innerHTML = CATEGORIES.map(c=>`<option value="${c.key}">${c.label}</option>`).join('') },
  async submitListing(e){
    e.preventDefault(); if(!auth.currentUser) return APP.route('/login');
    const title=APP.el('new-title').value.trim(), cat=APP.el('new-cat').value, desc=APP.el('new-desc').value.trim();
    const price = parseFloat(APP.el('new-price').value)||null; const poa=APP.el('new-poa').checked; const city=APP.el('new-city').value.trim();
    const photosInput=APP.el('new-photos'); const files=[...photosInput.files].slice(0,6);
    const ownerId=auth.currentUser.uid;
    const docRef = await addDoc(collection(db,'listings'), { title, cat, desc, price, poa, city, ownerId, condition:'novo', createdAt:serverTimestamp(), avgRating:0, reviewsCount:0, photos:[] });
    const urls=[];
    for(const f of files){
      const r=ref(storage,`listings/${docRef.id}/${f.name}`);
      await uploadBytes(r,f);
      urls.push(await getDownloadURL(r));
    }
    await updateDoc(doc(db,'listings',docRef.id), { photos:urls });
    APP.route(`/listing/${docRef.id}`);
  },

  /* LISTING DETAILS */
  async openListing(id){
    history.pushState({},'',`#/listing/${id}`);
    APP.show('view-listing');
    const d=await getDoc(doc(db,'listings',id));
    if(!d.exists()) return alert('Oglas nije pronađen');
    const it={ id:d.id, ...d.data() };
    APP.state.currentListing=it;
    APP.renderListing(it);
    APP.listenReviews(id);
  },
  renderListing(it){
    APP.el('l-title').textContent=it.title;
    APP.el('l-cat').textContent=APP.catLabel(it.cat);
    APP.el('l-city').textContent=it.city||'';
    APP.el('l-desc').textContent=it.desc||'';
    APP.el('l-price').textContent=it.poa?'Na upit': (it.price?`${it.price} BAM`:'' );
    APP.el('l-upit').textContent = it.poa? 'Cijena dostupna na upit' : '';
    const starsFull = Math.floor(it.avgRating||0); const half=(it.avgRating||0)-starsFull>=.5;
    APP.el('l-rating').innerHTML =
      `${'<i class="bi bi-star-fill"></i>'.repeat(starsFull)}${half?'<i class="bi bi-star-half"></i>':''}${'<i class="bi bi-star"></i>'.repeat(5 - starsFull - (half?1:0))} <span class="text-muted small">(${it.reviewsCount||0})</span>`;
    const inner = APP.el('galleryInner');
    const photos = it.photos && it.photos.length? it.photos : ['https://images.unsplash.com/photo-1581092921461-eab62e97a780?q=80&w=1200&auto=format&fit=crop'];
    inner.innerHTML = photos.map((u,i)=>`<div class="carousel-item ${i===0?'active':''}"><img src="${u}" class="d-block w-100" style="height:360px;object-fit:cover"></div>`).join('');
    APP.loadSeller(it.ownerId);
    APP.initChat(it.ownerId, it.id);
  },

  async loadSeller(uid){
    const p=await getDoc(doc(db,'profiles',uid));
    const data=p.data()||{name:'Korisnik'};
    APP.el('s-name').textContent=data.name||'Korisnik';
    APP.el('s-bio').textContent=data.bio||'';
    APP.el('s-profile').setAttribute('onclick',`APP.route('/profile/${uid}')`);
  },

  /* REVIEWS */
  listenReviews(listingId){
    const refCol=collection(db,'listings',listingId,'reviews');
    const qy=query(refCol, orderBy('createdAt','desc'));
    onSnapshot(qy, snap=>{
      const arr=snap.docs.map(d=>({id:d.id, ...d.data()}));
      APP.el('revCount').textContent=`${arr.length} recenzija`;
      APP.el('revList').innerHTML = arr.map(r=>`
        <div>
          <div class="d-flex align-items-center gap-2">
            <strong>${r.authorName||'Korisnik'}</strong>
            <span class="badge bg-light text-dark">${r.rating}★</span>
            <small class="text-muted">${new Date(r.createdAt?.seconds*1000||Date.now()).toLocaleDateString()}</small>
          </div>
          <div class="text-muted">${r.text}</div>
        </div>`).join('');
    });
  },
  async submitReview(e){
    e.preventDefault();
    if(!auth.currentUser) return APP.route('/login');
    const l=APP.state.currentListing;
    const rating=parseInt(APP.el('revRating').value);
    const text=APP.el('revText').value.trim();
    const authorName=auth.currentUser.displayName||'Korisnik';
    await addDoc(collection(db,'listings',l.id,'reviews'), { rating, text, authorId:auth.currentUser.uid, authorName, createdAt:serverTimestamp() });
    APP.el('revText').value='';
    const revSnap=await getDocs(collection(db,'listings',l.id,'reviews'));
    const arr=revSnap.docs.map(d=>d.data());
    const avg = arr.reduce((s,x)=>s+x.rating,0)/arr.length;
    await updateDoc(doc(db,'listings',l.id), { avgRating:avg, reviewsCount:arr.length });
  },

  /* PROFILE */
  async openProfile(uid){
    history.pushState({},'', uid===APP.state.user?.uid? '#/profile' : `#/profile/${uid}`);
    APP.show('view-profile');
    const p=await getDoc(doc(db,'profiles',uid));
    const data=p.data()||{};
    APP.el('p-name').textContent=data.name||'-';
    APP.el('p-email').textContent=APP.state.user && uid===APP.state.user.uid ? (auth.currentUser.email||'') : '';
    APP.el('p-bio').value=data.bio||'';
    APP.el('p-city').value=data.city||'';
    APP.el('p-phone').value=data.phone||'';
    document.getElementById('p-avatar').src = `https://i.pravatar.cc/120?u=${uid}`;
    APP.state.profileUid=uid;
  },
  async saveProfile(){
    const uid=APP.state.user.uid;
    await setDoc(doc(db,'profiles',uid), {
      name:auth.currentUser.displayName||'Korisnik',
      bio:APP.el('p-bio').value,
      city:APP.el('p-city').value,
      phone:APP.el('p-phone').value
    }, { merge:true });
    alert('Profil spašen ✅');
  },

  /* CHAT */
  convId(ownerId, listingId){ const a=auth.currentUser?.uid||'anon'; const arr=[a, ownerId, listingId]; return arr.join('_'); },
  initChat(ownerId, listingId){
    APP.state.currentThread={ ownerId, listingId, id: APP.convId(ownerId, listingId) };
    const box=APP.el('chatBox');
    box.innerHTML='';
    if(!auth.currentUser){
      box.innerHTML='<div class="p-2 text-muted">Prijavi se da pošalješ poruku.</div>';
      return;
    }
    const convRef=doc(db,'conversations',APP.state.currentThread.id);
    const msgs=collection(convRef,'messages');
    const qy=query(msgs, orderBy('createdAt','asc'));
    onSnapshot(qy, snap=>{
      box.innerHTML = snap.docs.map(d=>{
        const m=d.data();
        const mine=m.authorId===auth.currentUser.uid;
        return `<div class="d-flex ${mine?'justify-content-end':''}"><div class="msg ${mine?'me':'them'}">${m.text}</div></div>`;
      }).join('');
      box.scrollTop=box.scrollHeight;
    });
  },
  async startChat(){ if(!auth.currentUser) return APP.route('/login'); },
  async sendChat(e){
    e.preventDefault();
    const input=APP.el('chatInput');
    const text=input.value.trim();
    if(!text) return;
    const t=APP.state.currentThread;
    const convRef=doc(db,'conversations',t.id);
    await setDoc(convRef, { lastAt:serverTimestamp(), listingId:t.listingId, users:[auth.currentUser.uid, t.ownerId] }, {merge:true});
    await addDoc(collection(convRef,'messages'), { text, authorId:auth.currentUser.uid, createdAt:serverTimestamp() });
    input.value='';
  },

  /* INBOX */
  async openInbox(){
    history.pushState({},'','#/inbox');
    APP.show('view-inbox');
    const qy=query(collection(db,'conversations'), orderBy('lastAt','desc'));
    onSnapshot(qy, snap=>{
      const uid=auth.currentUser.uid;
      APP.el('threadList').innerHTML = snap.docs
        .filter(d=> (d.data().users||[]).includes(uid))
        .map(d=>{
          const c=d.data();
          return `<button class="list-group-item list-group-item-action" onclick="APP.openThread('${d.id}')">
                    <div class="fw-semibold">Razgovor</div>
                    <small class="text-muted">Listing: ${c.listingId}</small>
                  </button>`;
        }).join('');
    });
  },
  async openThread(id){
    APP.state.currentThread={ id };
    APP.el('threadTitle').textContent = 'Razgovor';
    const box=APP.el('threadBox');
    const qy=query(collection(db,'conversations',id,'messages'), orderBy('createdAt','asc'));
    onSnapshot(qy, snap=>{
      box.innerHTML = snap.docs.map(d=>{
        const m=d.data();
        const mine=m.authorId===auth.currentUser.uid;
        return `<div class="d-flex ${mine?'justify-content-end':''}"><div class="msg ${mine?'me':'them'}">${m.text}</div></div>`;
      }).join('');
      box.scrollTop=box.scrollHeight;
    });
  },
  async sendThread(e){
    e.preventDefault();
    const text=APP.el('threadInput').value.trim();
    if(!text||!APP.state.currentThread) return;
    const convRef=doc(db,'conversations',APP.state.currentThread.id);
    await setDoc(convRef, { lastAt:serverTimestamp() }, {merge:true});
    await addDoc(collection(convRef,'messages'), { text, authorId:auth.currentUser.uid, createdAt:serverTimestamp() });
    APP.el('threadInput').value='';
  },

  /* HOME reviews */
  async renderHomeReviews(){
    const snaps = await getDocs(collection(db,'listings'));
    const revBlocks=[];
    for(const d of snaps.docs.slice(0,2)){
      const revs = await getDocs(query(collection(db,'listings',d.id,'reviews'), orderBy('createdAt','desc'), limit(1)));
      revs.forEach(r=>{
        const v=r.data();
        revBlocks.push(
          `<div class="col-12 col-md-6">
             <div class="p-3 bg-white border rounded-3 h-100">
               <div class="d-flex align-items-center gap-2 mb-1">
                 <img class="rounded-circle" src="https://i.pravatar.cc/100?u=${v.authorId}" width="44" height="44">
                 <div>
                   <div class="fw-semibold">${v.authorName||'Korisnik'}</div>
                   <div class="small text-muted">${(new Date(v.createdAt?.seconds*1000||Date.now())).toLocaleDateString()}</div>
                 </div>
               </div>
               <div class="small mb-1"><span class="badge bg-light text-dark">${v.rating}★</span></div>
               <div class="text-muted">${v.text}</div>
             </div>
           </div>`
        );
      });
    }
    APP.el('homeReviews').innerHTML = revBlocks.join('');
  },

  /* INIT */
  async init(){
    document.getElementById('year').textContent=new Date().getFullYear();
    APP.renderCats(); APP.renderFeatured(); APP.renderHomeReviews();
    onAuthStateChanged(auth, user=>{
      APP.state.user=user||null;
      document.getElementById('authLinks').classList.toggle('hidden', !!user);
      document.getElementById('userMenu').classList.toggle('hidden', !user);
      document.getElementById('userNameShort').textContent = user?.displayName?.split(' ')[0]||'Profil';
    });
    const handleHash=()=>{
      const h=location.hash.replace('#','');
      if(!h||h==='/') APP.route('/');
      else APP.route(h);
    };
    window.addEventListener('popstate', handleHash);
    handleHash();
  }
};
window.APP=APP;
APP.init();
