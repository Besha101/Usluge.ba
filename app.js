// ----- Firebase + App Logic (module) -----

// 1) UNESI SVOJ FIREBASE KONFIG OVDJE ↓  (Project settings » General » Your apps)
const firebaseConfig = {
  apiKey: "AIzaSyDmqAkGl1TVXTOWaqBTJZw_o2D3VJ0XkkY",
  authDomain: "uslugeba-278b6.firebaseapp.com",
  projectId: "uslugeba-278b6",
  storageBucket: "gs://uslugeba-278b6.firebasestorage.app",
  messagingSenderId: "748061595893",
  appId: "1:748061595893:web:ed03a1a71d74560affcdbc",
  measurementId: "G-CVC3XTPRT9"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, serverTimestamp, query, where, orderBy, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);
const db = getFirestore(app);
const storage = getStorage(app);
let cropper = null;

async function hydrateProfileUI(user){
  const nameEl  = document.getElementById('p-name');
  const emailEl = document.getElementById('p-email');
  const imgEl   = document.getElementById('p-avatar');
  const iconEl  = document.getElementById('p-avatar-icon');
  if (!nameEl || !emailEl) return;

  // 1) iz Auth
  nameEl.textContent  = user?.displayName || 'Ime korisnika';
  emailEl.textContent = user?.email || 'email@example.com';

  if (user?.photoURL && imgEl){
    imgEl.src = user.photoURL;
    imgEl.classList.remove('d-none');
    iconEl?.classList.add('d-none');
  }

  // 2) pregazi iz Firestore ako postoji
  try{
    if (user) {
      const snap = await getDoc(doc(db, 'profiles', user.uid));
      if (snap.exists()){
        const p = snap.data();
        if (p.name)     nameEl.textContent = p.name;
        if (p.photoURL && imgEl){
          imgEl.src = p.photoURL;
          imgEl.classList.remove('d-none');
          iconEl?.classList.add('d-none');
        }
      }
    }
  }catch(e){ console.warn('hydrateProfileUI:', e); }
}


// Pretvori cropper u Blob (krug, PNG) – size možeš mijenjati (512, 256, 1024…)
async function getCroppedAvatarBlob(size = 512) {
  return new Promise((resolve, reject) => {
    if (!cropper) return reject(new Error('Cropper nije spreman'));

    // kvadratno platno 1:1
    const square = cropper.getCroppedCanvas({
      width: size,
      height: size,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      fillColor: '#000' // koristi se samo kod JPEG-a
    });

    // isijeci krug na transparentnu pozadinu (PNG)
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const ctx = out.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(square, 0, 0, size, size);
    ctx.restore();
    out.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png', 1);
  });
}


const CATEGORIES = [
  { key:'elektricar', label:'Električar', icon:'bi-lightbulb' },
  { key:'vodoinstalater', label:'Vodoinstalater', icon:'bi-droplet' },
  { key:'gradjevina', label:'Građevinski radovi', icon:'bi-nut' },
  { key:'kucni', label:'Kućni majstor', icon:'bi-tools' },
  { key:'casovi', label:'Časovi', icon:'bi-easel' },
  { key:'ljepota', label:'Ljepota i zdravlje', icon:'bi-heart' },
  { key:'auto', label:'Auto mehanika', icon:'bi-car-front' },
  { key:'ciscenje', label:'Čišćenje', icon:'bi-bucket' },
  { key:'prevodjenje', label:'Prevođenje', icon:'bi-chat-square-dots' },
  { key:'dostava', label:'Dostava', icon:'bi-truck' },
  { key:'foto', label:'Fotografija i Video', icon:'bi-camera' },
  { key:'ostalo', label:'Ostalo', icon:'bi-grid-3x3-gap' },
];

const APP = {
  pageSize: 9,
  state: { user:null, view:'home', cat:null, page:1, list:[], currentListing:null, currentThread:null },
  el: id=>document.getElementById(id),
    showError(id, msg){
    const box = document.getElementById(id);
    if(!box) return;
    box.textContent = msg;
    box.classList.remove('d-none');
    // auto-hide nakon 6 sekundi
    setTimeout(()=> box.classList.add('d-none'), 6000);
  },

  show(id){ document.querySelectorAll('[data-view]').forEach(v=>v.classList.add('hidden')); APP.el(id).classList.remove('hidden') },
  route(path){
    if(path==='/') { history.pushState({},'', '#/'); APP.show('view-home') }
    else if(path==='/login'){
  if (APP.state.user) return APP.route('/'); // već logovan → na početnu
  history.pushState({},'','#/login'); APP.show('view-login');
}
else if(path==='/register'){
  if (APP.state.user) return APP.route('/'); // već logovan → na početnu
  history.pushState({},'','#/register'); APP.show('view-register');
}

    else if(path==='/new'){ if(!APP.state.user) return APP.route('/login'); history.pushState({},'','#/new'); APP.populateCats(); APP.show('view-new') }
    else if(path.startsWith('/category/')){ const cat=path.split('/')[2]; APP.openCategory(cat) }
    else if(path.startsWith('/listing/')){ const id=path.split('/')[2]; APP.openListing(id) }
    else if(path==='/profile'){ if(!APP.state.user) return APP.route('/login'); APP.openProfile(APP.state.user.uid) }
    else if(path.startsWith('/profile/')){ const uid=path.split('/')[2]; APP.openProfile(uid) }
    else if(path==='/inbox'){ if(!APP.state.user) return APP.route('/login'); APP.openInbox() }
  },
  searchFromNav(e){ e.preventDefault(); const q = APP.el('navSearch').value.trim(); if(!q) return; APP.route('/category/ostalo'); APP.el('f-q').value=q; APP.applyFilters(); },

  /* AUTH */
  /* AUTH */
async handleLogin(e){
  e.preventDefault();
  const email = APP.el('login-email').value.trim();
  const pass  = APP.el('login-pass').value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    APP.route('/');  // preusmjeri na početnu stranicu
  } catch(err) {
    APP.showError('login-error', niceAuthError(err));
  }
},

async handleRegister(e){
  e.preventDefault();
  const name  = APP.el('reg-name').value.trim();
  const email = APP.el('reg-email').value.trim();
  const pass  = APP.el('reg-pass').value.trim();

  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(user, { displayName: name });
    await setDoc(doc(db, 'profiles', user.uid), {
      name,
      bio: '',
      city: '',
      phone: '',
      createdAt: serverTimestamp()
    }, { merge: true });

    APP.route('/profile');
  } catch(err) {
    APP.showError('reg-error', niceAuthError(err));
  }
},

  async logout(){
  await signOut(auth);
  // ako si bio na zaštićenoj ruti, prebaci na login
  const h = (location.hash || '#/').replace('#','');
  if (['/profile','/new','/inbox'].includes(h)) {
    APP.route('/login');
  } else {
    APP.route('/'); // sigurni fallback
  }
},


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
  history.pushState({},'', uid===APP.state.user?.uid ? '#/profile' : `#/profile/${uid}`);
  APP.show('view-profile');

  // učitaj profil
  const p = await getDoc(doc(db,'profiles',uid));
  const data = p.data() || {};

  // popuni osnovno
  const resolvedName = data.name || (uid===auth.currentUser?.uid ? auth.currentUser.displayName : '');
APP.el('p-name').textContent = resolvedName || 'Ime korisnika';

  APP.el('p-email').textContent = uid===auth.currentUser?.uid ? (auth.currentUser.email || '') : '';
  APP.el('p-bio').value   = data.bio   || '';
  APP.el('p-city').value  = data.city  || '';
  APP.el('p-phone').value = data.phone || '';

  // avatar elementi
  const pAvWrap = document.getElementById('p-avatar-wrap');
  const pImg    = document.getElementById('p-avatar');
  const pIcon   = document.getElementById('p-avatar-icon');
  const fileInp = document.getElementById('p-photo');

  const setAvatar = (url)=>{
    if(url){ pImg.src=url; pImg.classList.remove('d-none'); pIcon.classList.add('d-none'); }
    else   { pImg.classList.add('d-none'); pIcon.classList.remove('d-none'); }
  };

  if (uid === APP.state.user?.uid){
    // moj profil
    setAvatar(auth.currentUser.photoURL || data.photoURL || null);

    // klik na sliku -> odabir file-a
    pAvWrap.onclick = () => fileInp.click();

    // crop modal
    fileInp.onchange = () => {
  const f = fileInp.files[0];
  if (!f) return;

  const reader = new FileReader();
  reader.onload = function(e){
    // Bootstrap modal s našim stilom
    const modal = document.createElement('div');
    modal.className = 'modal fade crop-modal';
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">Uredi sliku</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Zatvori"></button>
          </div>
          <div class="modal-body">
            <div class="crop-area">
              <img id="crop-image" src="${e.target.result}" alt="crop">
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <div class="text-muted small">Povuci sliku, točkić = zoom.</div>
              <div class="btn-group">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="crop-zoom-in">+</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="crop-zoom-out">−</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="crop-rotate">↻</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="crop-reset">Reset</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button id="crop-save" class="btn btn-brand text-white">Spremi</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    const cropImgEl = modal.querySelector('#crop-image');

// čekaj da <img> dobije dimenzije pa tek onda inicijaliziraj Cropper
cropImgEl.addEventListener('load', () => {
  if (cropper) { try { cropper.destroy(); } catch(_) {} }
  cropper = new Cropper(cropImgEl, {
  viewMode: 3,                 // strože ograniči canvas na kontejner
  dragMode: 'move',
  aspectRatio: 1,
  autoCropArea: 1,             // crop box = maksimalan
  background: false,
  guides: false,
  center: true,
  highlight: false,
  movable: true,
  zoomable: true,
  scalable: false,
  rotatable: false,
  cropBoxMovable: false,
  cropBoxResizable: false,
  toggleDragModeOnDblclick: false,

 ready() {
  const C = this.cropper;

  // 0) reset na neutralno (da nema starog scale-a)
  C.reset();

  // 1) podaci o kontejneru (tvoj postojeći okvir u modalu OSTaje iste veličine)
  const cont = C.getContainerData();          // {width, height}
  const fullW = cont.width;
  const fullH = cont.height;

  // 2) raširi SLIKU (canvas) da POKRIJE CIJELI KONTEJNER (cover po kontejneru)
  const img = C.getImageData();               // koristi natural dimenzije fajla
  const coverScale = Math.max(fullW / img.naturalWidth, fullH / img.naturalHeight);
  const canvasW = img.naturalWidth  * coverScale;
  const canvasH = img.naturalHeight * coverScale;

  C.setCanvasData({
    width:  canvasW,
    height: canvasH,
    left:   (fullW - canvasW) / 2,
    top:    (fullH - canvasH) / 2
  });

  // 3) crop box = najveći mogući KRUG unutar tog kontejnera (ne mičemo modal)
  const size = Math.min(fullW, fullH) * 0.98; // po želji 0.96–1.00
  C.setCropBoxData({
    left: (fullW  - size) / 2,
    top:  (fullH  - size) / 2,
    width:  size,
    height: size
  });
}


});






      // kontrole
      modal.querySelector('#crop-zoom-in').onclick = ()=> cropper.zoom(0.1);
      modal.querySelector('#crop-zoom-out').onclick = ()=> cropper.zoom(-0.1);
      modal.querySelector('#crop-rotate').onclick   = ()=> cropper.rotate(90);
      modal.querySelector('#crop-reset').onclick    = ()=> cropper.reset();

      // Spremi odmah na Firebase Storage i postavi avatar
// =================== SPREMI — Firebase upload direktno ===================
const btnSave = modal.querySelector('#crop-save');
btnSave.onclick = async () => {
  if (!cropper) { alert('Slika nije spremna.'); return; }

  // UI feedback
  btnSave.disabled = true;
  const prevTxt = btnSave.textContent;
  btnSave.textContent = 'Spremanje 0%…';

  try {
    // 1) Croppani krug kao PNG (promijeni 512 po želji)
    const blob = await getCroppedAvatarBlob(512);
    if (!blob || !blob.size) throw new Error('Prazan blob (canvas).');

    // 2) Putanja – ako nisi logiran, ide u /avatars/public/
    const uid = auth.currentUser?.uid;
if (!uid) {
  alert("Moraš biti prijavljen da bi spremio sliku.");
  return;
}

    const r = ref(storage, `users/${uid}/profile/avatar.png`);


    // 3) Upload sa progresom
    const task = uploadBytesResumable(r, blob, { contentType: 'image/png' });

    // WATCHDOG: ako 10s stoji na 0% -> prekini i prijavi
    let lastPct = 0;
    const watchdog = setTimeout(() => {
      if (lastPct === 0) {
        try { task.cancel(); } catch {}
        alert('Upload stoji na 0%. Najčešći uzrok: Firebase Storage Rules ne dopuštaju pisanje bez prijave. Prijavi se ili privremeno olabavi rules.');
        btnSave.disabled = false;
        btnSave.textContent = prevTxt;
      }
    }, 10000);

    task.on('state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        lastPct = pct;
        btnSave.textContent = `Spremanje ${pct}%…`;
      },
      (error) => {
        clearTimeout(watchdog);
        console.error('Upload error:', error);
        alert('Greška pri uploadu: ' + (error?.message || error));
        btnSave.disabled = false;
        btnSave.textContent = prevTxt;
      },
      async () => {
        clearTimeout(watchdog);
        // 4) URL + osvježi UI
        const url = await getDownloadURL(task.snapshot.ref);
         const finalUrl = `${url}?t=${Date.now()}`; // cache-bust samo za prikaz

         const pImg  = document.getElementById('p-avatar');
         const pIcon = document.getElementById('p-avatar-icon');
         if (pImg)  { pImg.src = finalUrl; pImg.classList.remove('d-none'); }
        if (pIcon) pIcon.classList.add('d-none');

        const navImg  = document.getElementById('nav-avatar');
 const navIcon = document.getElementById('nav-avatar-icon');
 if (navImg)  { navImg.src = finalUrl; navImg.classList.remove('d-none'); }
        if (navIcon) navIcon.classList.add('d-none');

        // (opciono) upiši u Auth/Firestore – samo ako si logiran
        try { if (auth?.currentUser) await updateProfile(auth.currentUser, { photoURL: url }); } catch (e) { console.warn('updateProfile:', e); }
 try { if (auth?.currentUser) await setDoc(doc(db, 'profiles', auth.currentUser.uid), { photoURL: url }, { merge: true }); } catch (e) { console.warn('setDoc:', e); }

        // zatvori modal
        const bsModal = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
        bsModal.hide();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());

        btnSave.disabled = false;
        btnSave.textContent = 'Spremi';
      }
    );
  } catch (err) {
    console.error(err);
    alert('Greška: ' + (err?.message || err));
    btnSave.disabled = false;
    btnSave.textContent = prevTxt;
  }
};


    }, { once:true });
  };
  reader.readAsDataURL(f);
};


  } else {
    // tuđi profil (read-only)
    setAvatar(data.photoURL || null);
  }

  APP.state.profileUid = uid;
}
,
  async saveProfile(){
  const uid = APP.state.user.uid;
  const fileInp = APP.el('p-photo');
  const file = fileInp && fileInp.files[0] ? fileInp.files[0] : null;

  let photoURL = auth.currentUser.photoURL || null;

  try {
    // 1) upload nove slike ako je izabrana
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Slika je veća od 2 MB. Smanji je pa pokušaj ponovo.');
        return;
      }
      const path = `users/${uid}/profile/raw/${Date.now()}_${file.name}`;
      const r = ref(storage, path);
      await uploadBytes(r, file);
      photoURL = await getDownloadURL(r);
      await updateProfile(auth.currentUser, { photoURL });
    }

    // 2) snimi podatke u Firestore (uključujući sliku)
    // povuci postojeći profil da sačuvaš postojeće ime ako nema displayName-a
const profSnap = await getDoc(doc(db, 'profiles', uid));
const existing = profSnap.data() || {};
const safeName = existing.name || auth.currentUser.displayName || '';

await setDoc(doc(db, 'profiles', uid), {
  ...(safeName ? { name: safeName } : {}),   // upiši name samo ako ga stvarno imaš
  bio:  APP.el('p-bio').value,
  city: APP.el('p-city').value,
  phone: APP.el('p-phone').value,
  ...(photoURL ? { photoURL } : {})
}, { merge: true });


    // 3) osvježi UI
    const pImg    = document.getElementById('p-avatar');
    const pIcon   = document.getElementById('p-avatar-icon');
    const navImg  = document.getElementById('nav-avatar');
    const navIcon = document.getElementById('nav-avatar-icon');

    if (photoURL) {
      if (pImg)  { pImg.src = photoURL; pImg.classList.remove('d-none'); }
      if (pIcon) pIcon.classList.add('d-none');
      if (navImg){ navImg.src = photoURL; navImg.classList.remove('d-none'); }
      if (navIcon) navIcon.classList.add('d-none');
    } else {
      if (pImg)  pImg.classList.add('d-none');
      if (pIcon) pIcon.classList.remove('d-none');
      if (navImg) navImg.classList.add('d-none');
      if (navIcon) navIcon.classList.remove('d-none');
    }

    alert('Profil spašen ✅');
  } catch (e) {
    console.error(e);
    alert('Greška pri spremanju profila.');
  }
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
    // 1) Sačekaj da Auth vrati početno stanje (prije prvog routinga)
await new Promise((resolve) => {
  onAuthStateChanged(auth, user=>{
  APP.state.user = user || null;

  // UI toggle
  document.getElementById('authLinks').classList.toggle('hidden', !!user);
  document.getElementById('userMenu').classList.toggle('hidden', !user);

  const navImg  = document.getElementById('nav-avatar');
const navIcon = document.getElementById('nav-avatar-icon');
if (user?.photoURL) {
  if (navImg)  { navImg.src = user.photoURL; navImg.classList.remove('d-none'); }
  if (navIcon) { navIcon.classList.add('d-none'); }
} else {
  if (navImg)  { navImg.classList.add('d-none'); }
  if (navIcon) { navIcon.classList.remove('d-none'); }
}


  // ✅ AUTH GUARD: ako si odjavljen i stojiš na zaštićenoj ruti, prebaci
  const h = (location.hash || '#/').replace('#','');
  if (!user && ['/profile','/new','/inbox'].includes(h)) {
    APP.route('/login');
  }
    // resolve samo prvi put
    if (!APP._authReady) { APP._authReady = true; resolve(); }
  });
});

// 2) Tek sada bootaj ruter
const handleHash = () => {
  const h = location.hash.replace('#','');

  // ako je hash login/register a user već postoji → na početnu
  if ((h==='/login' || h==='/register') && APP.state.user) {
    return APP.route('/');
  }

  if (!h || h==='/') APP.route('/');
  else APP.route(h);
};

window.addEventListener('popstate', handleHash);
handleHash();

  }
  
};
function niceAuthError(err){
  const code = (err?.code || '').replace('auth/', '');
  switch(code){
    case 'invalid-email': return 'Email nije ispravan.';
    case 'missing-password': return 'Unesi lozinku.';
    case 'weak-password': return 'Lozinka mora imati najmanje 6 karaktera.';
    case 'email-already-in-use': return 'Ovaj email je već registriran.';
    case 'invalid-credential':
    case 'wrong-password': return 'Pogrešan email ili lozinka.';
    case 'user-not-found': return 'Nismo našli korisnika sa tim emailom.';
    default: return 'Došlo je do greške. Pokušaj ponovo.';
  }
}

window.APP=APP;
APP.init();
