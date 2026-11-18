// ============ SUPABASE INITIALIZATION ============
const SUPABASE_URL = 'https://jffykhzehgqlanmzdddk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmZnlraHplaGdxbGFubXpkZGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTQzMTAsImV4cCI6MjEwMDA5MDMxMH0.Sn9io7u0nrFmFBFr4QnwbjwBhAzgFg0MNBNC87BEf8k';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ APP STATE ============
let selectedFacilityImages = []; 
let currentSlideIndex = 0; 
let currentUser = null;
let currentRole = 'user';
let currentView = 'facilities';
let selectedFacility = null;
let selectedDate = new Date();
let selectedSlots = [];
let calendarMonth = new Date();
let dashFilteredBookingsCache = [];
let walkInBaseFacilityPrice = 0;
let walkInEquipmentList = [];
let walkInSelectedAddons = {};
let slotModalEquipmentList = [];
let slotModalAddonsCart = {};
let currentNotifications = [];
let currentNotifFilterTab = 'all';
let notifPollingInterval = null;

// ============ AUTH & NAVIGATION ============
function switchLoginTab(btn, tab) {
  document.querySelectorAll('.login-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!email || !password) { alert('Please enter your Email and Password'); return; }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { alert('Sign in failed: ' + error.message); return; }

  currentUser = data.user;
  await fetchUserProfile(currentUser.id);
}

const AVATAR_BUCKET = 'avatars';
let signUpAvatarBlob = null;

function applyAvatar(el, url, initials) {
  if (!el) return;
  if (url) {
    el.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = initials || '';
  }
}

function resizeImageToJpeg(file, size = 400) {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(objUrl);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Failed to process image')), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Unable to read this image file. Please use a JPG, PNG, or WEBP file.')); };
    img.src = objUrl;
  });
}

function validateAvatarFile(file) {
  if (!file) return false;
  if (!file.type || !file.type.startsWith('image/')) { alert('Please select an image file only'); return false; }
  if (file.size > 15 * 1024 * 1024) { alert('Image file size must not exceed 15 MB'); return false; }
  return true;
}

async function uploadAvatarBlob(userId, blob) {
  const path = userId + '/avatar.jpg';
  const { error } = await supabaseClient.storage.from(AVATAR_BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl + '?v=' + Date.now(); 
}

function closeAvatarPicker() {
  const el = document.getElementById('avatarPickerSheet');
  if (el) el.classList.remove('open');
}

function openAvatarPicker(target) {
  let sheet = document.getElementById('avatarPickerSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'avatarPickerSheet';
    sheet.className = 'avatar-sheet-overlay';
    sheet.innerHTML = `
      <div class="avatar-sheet" role="dialog">
        <div class="avatar-sheet-title">Profile Photo</div>
        <button type="button" class="avatar-sheet-btn" id="avatarSheetCamera">📷 Take Photo</button>
        <button type="button" class="avatar-sheet-btn" id="avatarSheetGallery">🖼️ Choose from Gallery / Files</button>
        <button type="button" class="avatar-sheet-btn cancel" onclick="closeAvatarPicker()">Cancel</button>
      </div>`;
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeAvatarPicker(); });
    document.body.appendChild(sheet);
  }
  const ids = target === 'signup' ? { camera: 'signUpAvatarCamera', gallery: 'signUpAvatar' } : { camera: 'profileAvatarCamera', gallery: 'profileAvatarInput' };
  document.getElementById('avatarSheetCamera').onclick = () => { closeAvatarPicker(); document.getElementById(ids.camera).click(); };
  document.getElementById('avatarSheetGallery').onclick = () => { closeAvatarPicker(); document.getElementById(ids.gallery).click(); };
  sheet.classList.add('open');
}

async function previewSignUpAvatar(input) {
  const file = input.files && input.files[0];
  if (!validateAvatarFile(file)) { input.value = ''; return; }
  try {
    signUpAvatarBlob = await resizeImageToJpeg(file);
    const box = document.getElementById('signUpAvatarPreview');
    box.style.backgroundImage = 'url("' + URL.createObjectURL(signUpAvatarBlob) + '")';
    box.classList.add('has-image');
    document.getElementById('signUpAvatarClear').style.display = 'inline-block';
  } catch (err) {
    signUpAvatarBlob = null; input.value = ''; alert(err.message);
  }
}

function clearSignUpAvatar() {
  signUpAvatarBlob = null;
  const input = document.getElementById('signUpAvatar'); if (input) input.value = '';
  const camInput = document.getElementById('signUpAvatarCamera'); if (camInput) camInput.value = '';
  const box = document.getElementById('signUpAvatarPreview');
  if (box) { box.style.backgroundImage = ''; box.classList.remove('has-image'); }
  const btn = document.getElementById('signUpAvatarClear'); if (btn) btn.style.display = 'none';
}

async function handleProfileAvatarChange(input) {
  const file = input.files && input.files[0];
  if (!file || !currentUser) return;
  if (!validateAvatarFile(file)) { input.value = ''; return; }
  const camBtn = document.querySelector('.avatar-edit-btn');
  if (camBtn) camBtn.disabled = true;
  try {
    const blob = await resizeImageToJpeg(file);
    const url = await uploadAvatarBlob(currentUser.id, blob);
    const { error } = await supabaseClient.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
    if (error) throw error;
    currentUser.profile = { ...(currentUser.profile || {}), avatar_url: url };
    setupNav();
    await loadUserProfileView();
    alert('✅ Profile photo updated successfully!');
  } catch (err) {
    alert('Failed to update profile photo: ' + (err.message || err));
  } finally {
    input.value = '';
    if (camBtn) camBtn.disabled = false;
  }
}

async function removeProfileAvatar() {
  if (!currentUser || !confirm('Are you sure you want to remove your profile photo?')) return;
  try {
    const { error } = await supabaseClient.from('profiles').update({ avatar_url: null }).eq('id', currentUser.id);
    if (error) throw error;
    await supabaseClient.storage.from(AVATAR_BUCKET).remove([currentUser.id + '/avatar.jpg']);
    currentUser.profile = { ...(currentUser.profile || {}), avatar_url: null };
    setupNav();
    await loadUserProfileView();
  } catch (err) {
    alert('Failed to remove profile photo: ' + (err.message || err));
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('showing', show);
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.title = show ? 'Hide password' : 'Show password';
  input.focus();
}

function checkPasswordRules(pw) {
  return { len: pw.length >= 8, upper: /[A-Z]/.test(pw), num: /[0-9]/.test(pw), sym: /[^A-Za-z0-9\s]/.test(pw) };
}

function getPasswordStrength(pw) {
  const rules = checkPasswordRules(pw);
  const passed = Object.values(rules).filter(Boolean).length;
  const percent = passed * 25;
  let level = 'none', text = 'Not entered';
  if (pw.length > 0) {
    if (percent <= 25) { level = 'weak'; text = 'Very Weak'; }
    else if (percent === 50) { level = 'fair'; text = 'Weak'; }
    else if (percent === 75) { level = 'good'; text = 'Good'; }
    else { level = 'strong'; text = 'Strong'; }
  }
  return { rules, percent, level, text, ok: percent === 100 };
}

function updatePasswordStrength(pw) {
  const s = getPasswordStrength(pw);
  const fill = document.getElementById('pwBarFill');
  const label = document.getElementById('pwStrengthLabel');
  const box = document.getElementById('pwStrength');
  if (!fill || !label || !box) return;
  fill.style.width = s.percent + '%';
  box.dataset.level = s.level;
  label.textContent = s.percent + '% - ' + s.text;
  const map = { pwRuleLen: 'len', pwRuleUpper: 'upper', pwRuleNum: 'num', pwRuleSym: 'sym' };
  Object.keys(map).forEach(id => { document.getElementById(id).classList.toggle('met', s.rules[map[id]]); });
}

async function handleSignUp() {
  const name = document.getElementById('signUpName').value.trim();
  const email = document.getElementById('signUpEmail').value.trim();
  const phone = document.getElementById('signUpPhone').value.trim();
  const password = document.getElementById('signUpPassword').value.trim();

  if (!name || !email || !password) { alert('Please fill in all required fields'); return; }
  if (!getPasswordStrength(password).ok) { alert('Password is not strong enough. Please meet all requirements.'); return; }

  const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password });
  if (error) { alert('Registration failed: ' + error.message); return; }

  if (data.user) {
    let avatarUrl = null; let avatarNote = '';
    if (signUpAvatarBlob) {
      if (data.session) {
        try { avatarUrl = await uploadAvatarBlob(data.user.id, signUpAvatarBlob); } 
        catch (e) { avatarNote = '\n(Profile photo upload failed. You can add it later.)'; }
      } else {
        avatarNote = '\n(You can add a profile photo on your Profile page after verifying your email and signing in.)';
      }
    }
    const profileRow = { id: data.user.id, name: name, phone: phone, role: 'user' };
    if (avatarUrl) profileRow.avatar_url = avatarUrl;
    await supabaseClient.from('profiles').insert([profileRow]);
    alert('Registration successful! Signing you in automatically...' + avatarNote);
    clearSignUpAvatar();
    currentUser = data.user;
    await fetchUserProfile(currentUser.id);
  }
}

// ============ ROLE PERMISSIONS (Strict RBAC: Admin vs. Owner vs. Staff vs. User) ============
const VIEW_ACCESS = {
  admin: ['platform', 'users', 'manage-facilities', 'profile'],
  owner: ['dashboard', 'manage-facilities', 'payments', 'matrix', 'slots', 'profile'],
  staff: ['scanner', 'payments', 'profile'],
  user:  ['facilities', 'booking', 'my-bookings', 'history', 'profile']
};
const HOME_VIEW = { admin: 'platform', owner: 'dashboard', staff: 'scanner', user: 'facilities' };

function normalizeRole(r) {
  const x = String(r || 'user').trim().toLowerCase();
  return VIEW_ACCESS[x] ? x : 'user';
}
function canAccessView(view, role) {
  return (VIEW_ACCESS[role || currentRole] || []).includes(view);
}
function escPlat(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function fetchUserProfile(userId) {
  const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) { currentRole = 'user'; } else { currentRole = normalizeRole(data.role); currentUser.profile = data; }
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appShell').style.display = 'grid';
  updateReportFabVisibility();
  setupNav();
  await fetchFacilities('all');
  await switchView(HOME_VIEW[currentRole] || 'facilities');
  if (window.lucide) lucide.createIcons();
}

async function openAdminModule(tab, linkEl) {
  if (currentRole !== 'admin') return;
  currentPlatformSubTab = tab || 'all';
  if (currentView !== 'platform') {
    await switchView('platform');
  } else {
    switchPlatformSubTab(currentPlatformSubTab);
  }
  document.querySelectorAll('#navAdminLinks a').forEach(a => {
    if (a.dataset.adminTab) {
      a.classList.toggle('active', a.dataset.adminTab === currentPlatformSubTab);
    } else {
      a.classList.remove('active');
    }
  });
}

async function switchView(view) {
  if (!canAccessView(view)) {
    console.warn('[RBAC] role "' + currentRole + '" is not authorized to access "' + view + '" -> redirecting to home');
    view = HOME_VIEW[currentRole] || 'facilities';
  }
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById('view-' + view);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    if (currentRole === 'admin' && view === 'platform' && a.dataset.adminTab) {
      a.classList.toggle('active', a.dataset.adminTab === (currentPlatformSubTab || 'all'));
    } else if (a.dataset.view === view && !a.dataset.adminTab) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });

  if (view === 'facilities') await fetchFacilities(currentSportFilter || 'all');
  if (view === 'my-bookings') await renderMyBookings();
  if (view === 'history') await renderHistory();
  if (view === 'manage-facilities') { await fetchFacilities('all'); if (currentRole === 'admin') await loadOwnerProfiles(); renderFacilitiesTable(); }
  if (view === 'payments') await renderPaymentsTable();
  if (view === 'slots') await initSlotManagement();
  if (view === 'dashboard') await renderDashboardStats();
  if (view === 'platform') await renderPlatformOverview();
  if (view === 'users') await renderUsersView();
  if (view === 'profile') await loadUserProfileView();
  if (window.lucide) lucide.createIcons();
}

function setupNav() {
  const userName = currentUser?.profile?.name || currentUser?.email || 'User';
  const avatarInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('userName').textContent = userName;
  const roleLabelMap = { admin: 'Admin (System Administrator)', owner: 'Owner (Facility Owner)', staff: 'Staff (Front Desk)', user: 'User (Customer)' };
  document.getElementById('userRole').textContent = roleLabelMap[currentRole] || currentRole;
  applyAvatar(document.getElementById('userAvatar'), currentUser?.profile?.avatar_url, avatarInitials);

  // Each role has its own strictly isolated navigation menu
  const navByRole = {
    user:  ['navUser', 'navUserLinks'],
    admin: ['navAdmin', 'navAdminLinks'],
    owner: ['navOwner', 'navOwnerLinks'],
    staff: ['navStaff', 'navStaffLinks']
  };
  Object.keys(navByRole).forEach(role => {
    const on = (role === currentRole);
    navByRole[role].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = on ? 'block' : 'none';
      el.classList.toggle('active-role-nav', on);
    });
  });

  // Role theme & badge
  ['admin', 'owner', 'staff', 'user'].forEach(r => document.body.classList.remove('role-' + r));
  document.body.classList.add('role-' + currentRole);
  const roleEl = document.getElementById('userRole');
  if (roleEl) roleEl.className = 'role role-chip role-chip-' + currentRole;

  // Dashboard title for Facility Owner
  const dashTitle = document.querySelector('#view-dashboard .ed-title-row h2');
  if (dashTitle) dashTitle.textContent = 'Sports Equipment Dashboard (My Facilities)';

  refreshNotifications(false);
  if (!notifPollingInterval) notifPollingInterval = setInterval(() => refreshNotifications(false), 25000);
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null; currentRole = 'user';
  ['loginEmail', 'loginPassword', 'signUpName', 'signUpEmail', 'signUpPhone'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  if (notifPollingInterval) { clearInterval(notifPollingInterval); notifPollingInterval = null; }
  toggleNotificationDrawer(false);
  currentNotifications = []; updateNotificationBadges();
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginScreen').classList.add('active');
  updateReportFabVisibility();
  closeReportIssueModal();
}

// ============ FACILITIES BROWSE ============
const THAI_PROVINCES = [
  "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา",
  "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก",
  "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน",
  "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา",
  "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต",
  "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี",
  "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ",
  "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี",
  "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"
];

const PROVINCE_EN_MAP = {
  "กรุงเทพมหานคร": "Bangkok", "กระบี่": "Krabi", "กาญจนบุรี": "Kanchanaburi", "กาฬสินธุ์": "Kalasin",
  "กำแพงเพชร": "Kamphaeng Phet", "ขอนแก่น": "Khon Kaen", "จันทบุรี": "Chanthaburi", "ฉะเชิงเทรา": "Chachoengsao",
  "ชลบุรี": "Chonburi", "ชัยนาท": "Chainat", "ชัยภูมิ": "Chaiyaphum", "ชุมพร": "Chumphon",
  "เชียงราย": "Chiang Rai", "เชียงใหม่": "Chiang Mai", "ตรัง": "Trang", "ตราด": "Trat",
  "ตาก": "Tak", "นครนายก": "Nakhon Nayok", "นครปฐม": "Nakhon Pathom", "นครพนม": "Nakhon Phanom",
  "นครราชสีมา": "Nakhon Ratchasima", "นครศรีธรรมราช": "Nakhon Si Thammarat", "นครสวรรค์": "Nakhon Sawan", "นนทบุรี": "Nonthaburi",
  "นราธิวาส": "Narathiwat", "น่าน": "Nan", "บึงกาฬ": "Bueng Kan", "บุรีรัมย์": "Buriram",
  "ปทุมธานี": "Pathum Thani", "ประจวบคีรีขันธ์": "Prachuap Khiri Khan", "ปราจีนบุรี": "Prachin Buri", "ปัตตานี": "Pattani",
  "พระนครศรีอยุธยา": "Phra Nakhon Si Ayutthaya", "พะเยา": "Phayao", "พังงา": "Phang Nga", "พัทลุง": "Phatthalung",
  "พิจิตร": "Phichit", "พิษณุโลก": "Phitsanulok", "เพชรบุรี": "Phetchaburi", "เพชรบูรณ์": "Phetchabun",
  "แพร่": "Phrae", "ภูเก็ต": "Phuket", "มหาสารคาม": "Maha Sarakham", "มุกดาหาร": "Mukdahan",
  "แม่ฮ่องสอน": "Mae Hong Son", "ยโสธร": "Yasothon", "ยะลา": "Yala", "ร้อยเอ็ด": "Roi Et",
  "ระนอง": "Ranong", "ระยอง": "Rayong", "ราชบุรี": "Ratchaburi", "ลพบุรี": "Lopburi",
  "ลำปาง": "Lampang", "ลำพูน": "Lamphun", "เลย": "Loei", "ศรีสะเกษ": "Si Sa Ket",
  "สกลนคร": "Sakon Nakhon", "สงขลา": "Songkhla", "สตูล": "Satun", "สมุทรปราการ": "Samut Prakan",
  "สมุทรสงคราม": "Samut Songkhram", "สมุทรสาคร": "Samut Sakhon", "สระแก้ว": "Sa Kaeo", "สระบุรี": "Saraburi",
  "สิงห์บุรี": "Sing Buri", "สุโขทัย": "Sukhothai", "สุพรรณบุรี": "Suphan Buri", "สุราษฎร์ธานี": "Surat Thani",
  "สุรินทร์": "Surin", "หนองคาย": "Nong Khai", "หนองบัวลำภู": "Nong Bua Lam Phu", "อ่างทอง": "Ang Thong",
  "อำนาจเจริญ": "Amnat Charoen", "อุดรธานี": "Udon Thani", "อุตรดิตถ์": "Uttaradit", "อุทัยธานี": "Uthai Thani",
  "อุบลราชธานี": "Ubon Ratchathani"
};

function translateProvince(p) {
  const clean = String(p || '').trim();
  return PROVINCE_EN_MAP[clean] || clean || 'Unspecified';
}

function translateAmenity(am) {
  const map = {
    "ที่จอดรถยนต์": "Car Parking",
    "ห้องน้ำในตัว": "Restrooms",
    "ร้านสะดวกซื้อใกล้ๆ": "Nearby Convenience Store",
    "อุปกรณ์ให้ยืม": "Equipment Rental"
  };
  const clean = String(am || '').trim();
  return map[clean] || clean;
}

function translateEqType(type) {
  const t = String(type || '').trim();
  if (t === 'เช่า' || t.toLowerCase() === 'rent') return 'Rent';
  if (t === 'ซื้อ' || t.toLowerCase() === 'buy') return 'Buy';
  return t || 'Buy';
}

function isRentEquipment(type) {
  const t = String(type || '').trim().toLowerCase();
  return t === 'เช่า' || t === 'rent';
}

function isBuyEquipment(type) {
  const t = String(type || '').trim().toLowerCase();
  return t === 'ซื้อ' || t === 'buy';
}

function translateBlockReason(reason) {
  const r = String(reason || '').trim();
  const map = {
    'ปิดปรับปรุง (Maintenance)': 'Maintenance',
    'จัดกิจกรรมพิเศษ (Event Reserved)': 'Event Reserved',
    'พักสนาม (Staff / Court Break)': 'Court Break',
    'ปิดปรับปรุง': 'Maintenance',
    'ปิดการใช้งาน': 'Closed'
  };
  return map[r] || r || 'Maintenance';
}

function translateBankName(bank) {
  const b = String(bank || '').trim();
  if (!b) return 'Not specified';
  const map = {
    'PromptPay (พร้อมเพย์)': 'PromptPay',
    'KBank (กสิกรไทย)': 'Kasikornbank (KBank)',
    'SCB (ไทยพาณิชย์)': 'Siam Commercial Bank (SCB)',
    'Krungthai (กรุงไทย)': 'Krungthai Bank (KTB)',
    'Bangkok Bank (กรุงเทพ)': 'Bangkok Bank (BBL)',
    'Krungsri (กรุงศรีฯ)': 'Bank of Ayudhya (Krungsri)',
    'TTB (ทหารไทยธนชาต)': 'TMBThanachart Bank (ttb)',
    'GSB (ออมสิน)': 'Government Savings Bank (GSB)'
  };
  return map[b] || b.replace(/\s*\([ก-๙a-zA-Z\s.]+\)\s*$/, '').trim() || b;
}

let currentSportFilter = 'all';
let currentProvinceFilter = 'all';

// Strictly scope venue operational ownership to 'owner' (and 'staff' for front-desk check-in)
// Platform 'admin' is the system administrator, NOT an operational venue manager.
function isMyManagedFacility(facility) {
  if (!facility) return false;
  if (currentRole === 'owner') return String(facility.owner_id || '') === String(currentUser?.id || '');
  return false;
}

function getMyManagedFacilities() {
  if (!FACILITIES) return [];
  if (currentRole === 'owner') return FACILITIES.filter(f => String(f.owner_id || '') === String(currentUser?.id || ''));
  if (currentRole === 'staff') return FACILITIES;
  return [];
}

function populateProvinceDropdowns() {
  const browseSelect = document.getElementById('browseProvinceFilter');
  if (browseSelect && browseSelect.options.length <= 1) {
    browseSelect.innerHTML = '<option value="all">All Provinces</option>' + THAI_PROVINCES.map(p => `<option value="${p}">${translateProvince(p)}</option>`).join('');
  }
  const addSelect = document.getElementById('addFieldProvince');
  if (addSelect && addSelect.options.length === 0) {
    addSelect.innerHTML = '<option value="">-- Select Province --</option>' + THAI_PROVINCES.map(p => `<option value="${p}">${translateProvince(p)}</option>`).join('');
  }
  const editSelect = document.getElementById('editFieldProvince');
  if (editSelect && editSelect.options.length === 0) {
    editSelect.innerHTML = '<option value="">-- Select Province --</option>' + THAI_PROVINCES.map(p => `<option value="${p}">${translateProvince(p)}</option>`).join('');
  }
}

function filterFacilities(btn, sport) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  currentSportFilter = sport || 'all';
  fetchFacilities(currentSportFilter);
}

function filterByProvince(province) {
  currentProvinceFilter = province || 'all';
  fetchFacilities(currentSportFilter);
}

async function fetchFacilities(filter = 'all') {
  populateProvinceDropdowns();
  currentSportFilter = filter || 'all';
  document.querySelectorAll('.filter-chip').forEach(btn => {
    const clickAttr = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', clickAttr.includes(`'${currentSportFilter}'`));
  });
  
  let query = supabaseClient.from('facilities').select('*');
  if (currentSportFilter !== 'all') query = query.eq('sport', currentSportFilter);
  const { data, error } = await query;
  if (error) return;
  FACILITIES = data || [];

  const filteredList = FACILITIES.filter(f => {
    if (!currentProvinceFilter || currentProvinceFilter === 'all') return true;
    const fp = (f.province || '').trim();
    return fp === currentProvinceFilter || translateProvince(fp) === translateProvince(currentProvinceFilter);
  });

  const grid = document.getElementById('facilitiesGrid');
  if (grid) {
    if (filteredList.length === 0) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-tertiary);">No sports facilities found for the selected province or sport category.</p>';
    } else {
      grid.innerHTML = filteredList.map(f => {
        let coverImg = '';
        if (f.images) {
          let imgs = [];
          if (Array.isArray(f.images)) imgs = f.images;
          else if (typeof f.images === 'string') {
            try { imgs = JSON.parse(f.images); } catch (e) { imgs = f.images.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"\vert{}"$/g, '').trim()).filter(Boolean); }
          }
          if (imgs.length > 0 && imgs[0]) coverImg = imgs[0].replace(/^"|"\$/g, '').trim();
        }

        const statusStr = (f.status || '').toLowerCase();
        const isAvailable = statusStr === 'available' || statusStr.includes('available');
        const cardClick = isAvailable ? `onclick="openBooking('${f.id}')"` : '';
        const cardCursor = isAvailable ? 'cursor:pointer;' : 'cursor:not-allowed; opacity:0.85;';
        const defaultColor = f.color || 'oklch(45% 0.12 140)';
        const cardMediaHTML = coverImg 
          ? `<div class="card-image" style="position: relative; overflow: hidden; background: #000;">
              <img src="${coverImg}" alt="${f.name}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;" />
              <div style="position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.4)); pointer-events: none;"></div>
              <span class="badge">${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</span>
              <span class="price-badge">฿${f.price}/hr</span>
            </div>`
          : `<div class="card-image" style="background: linear-gradient(135deg, ${defaultColor}, #222);">
              <span class="badge">${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</span>
              <span class="price-badge">฿${f.price}/hr</span>
            </div>`;
        const provinceText = translateProvince(f.province);

        return `
          <div class="facility-card" style="${cardCursor}" ${cardClick}>
            ${cardMediaHTML}
            <div class="card-body">
              <h3>${f.name}</h3>
              <div class="meta">
                <span><i data-lucide="map-pin" width="13" height="13"></i> ${provinceText}</span>
                <span><i data-lucide="clock" width="13" height="13"></i> 06:00 - 22:00</span>
              </div>
              <div class="status status-${f.status}"><span class="dot"></span>${f.status === 'available' ? 'Available Now' : 'Under Maintenance'}</div>
            </div>
          </div>`;
      }).join('');
    }
    if (window.lucide) lucide.createIcons();
  }
  if(document.getElementById('facilitiesTable')) renderFacilitiesTable();
}

// ============ BOOKING PROCESS ============
async function openBooking(facilityId) {
  selectedFacility = FACILITIES.find(f => f.id === facilityId);
  if (!selectedFacility) return;
  selectedSlots = []; selectedAddons = {}; resetSlipUploadUI();

  if (currentUser && (!currentUser.profile || !currentUser.profile.phone)) {
    const { data: prof } = await supabaseClient.from('profiles').select('name, phone').eq('id', currentUser.id).single();
    if (prof) currentUser.profile = { ...(currentUser.profile || {}), ...prof };
  }
  if (document.getElementById('bookingCustomerName')) document.getElementById('bookingCustomerName').value = currentUser?.profile?.name || '';
  if (document.getElementById('bookingCustomerPhone')) document.getElementById('bookingCustomerPhone').value = currentUser?.profile?.phone || '';

  document.getElementById('bookingTitle').textContent = selectedFacility.name;
  const sportName = selectedFacility.sport ? selectedFacility.sport.charAt(0).toUpperCase() + selectedFacility.sport.slice(1) : '-';
  const provinceName = translateProvince(selectedFacility.province);
  
  const metaEl = document.getElementById('bookingMeta');
  if (metaEl) {
    metaEl.innerHTML = `
      <span style="background: var(--primary); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 0.95rem; font-weight: 700;">⚽ ${sportName}</span>
      <span style="background: #fef2f2; color: var(--primary); border: 1px solid #fecaca; padding: 6px 14px; border-radius: 20px; font-size: 1rem; font-weight: 800;">฿${Number(selectedFacility.price || 0).toLocaleString()} / hr</span>
      <span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 14px; border-radius: 20px; font-size: 0.95rem; font-weight: 700;">📍 ${provinceName}</span>
    `;
  }
  if (document.getElementById('sumFacility')) document.getElementById('sumFacility').textContent = selectedFacility.name;

  const slider = document.getElementById('bookingImageSlider');
  const dotsContainer = document.getElementById('sliderDots');
  if (slider && dotsContainer) {
    slider.innerHTML = ''; dotsContainer.innerHTML = ''; currentSlideIndex = 0; slider.style.transform = 'translateX(0%)';
    let imgs = [];
    try {
      if (selectedFacility.images) {
        if (Array.isArray(selectedFacility.images)) imgs = selectedFacility.images;
        else if (typeof selectedFacility.images === 'string') imgs = JSON.parse(selectedFacility.images);
      }
    } catch (e) {}
    if (!Array.isArray(imgs)) imgs = [];
    imgs = imgs.map(u => String(u).replace(/^"|"\$/g, '').trim()).filter(u => u && u.startsWith('http'));

    const navButtons = slider.parentElement.querySelectorAll('button');
    if (imgs.length <= 1) navButtons.forEach(btn => btn.style.display = 'none');
    else navButtons.forEach(btn => btn.style.display = 'flex');

    if (imgs.length > 0) {
      slider.innerHTML = imgs.map(url => `<div class="slide-item" style="min-width: 100%; height: 100%; flex-shrink: 0; background: #000;"><img src="${url}" style="width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.9;"></div>`).join('');
      if (imgs.length > 1) dotsContainer.innerHTML = imgs.map((_, idx) => `<div class="slider-dot ${idx === 0 ? 'active' : ''}" onclick="setSlide(${idx})"></div>`).join('');
    } else {
      const defaultColor = selectedFacility.color || 'oklch(45% 0.12 140)';
      slider.innerHTML = `<div class="slide-item" style="min-width: 100%; height: 100%; flex-shrink: 0; background: linear-gradient(135deg, ${defaultColor}, #222); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.7); font-size: 1rem; font-weight: 500;">No additional images available</div>`;
    }
  }

  if (document.getElementById('bookingDescription')) document.getElementById('bookingDescription').textContent = selectedFacility.description || 'No additional description provided for this facility.';

  const amenitiesEl = document.getElementById('bookingAmenities');
  if (amenitiesEl) {
    let currentAmenities = [];
    try {
      if (Array.isArray(selectedFacility.amenities)) currentAmenities = selectedFacility.amenities;
      else if (typeof selectedFacility.amenities === 'string') currentAmenities = JSON.parse(selectedFacility.amenities);
    } catch (e) { currentAmenities = []; }
    amenitiesEl.innerHTML = currentAmenities.length > 0
      ? currentAmenities.map(am => `<span style="padding:4px 12px; background:#e8f5e9; color:#1b5e20; border-radius:20px; font-size:0.8rem; font-weight:600; border:1px solid #c8e6c9;">✓ ${translateAmenity(am)}</span>`).join('')
      : '<span style="color:var(--text-tertiary); font-size:0.85rem">No amenity information available</span>';
  }

  const mapContainer = document.getElementById('bookingMapContainer');
  if (mapContainer) {
    const mapUrl = (selectedFacility.map_url || '').trim();
    if (mapUrl) {
      mapContainer.style.display = 'block';
      mapContainer.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span style="font-size:0.88rem; font-weight:600; color:#334155;">📍 Location & Directions (${provinceName}):</span>
          <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:6px 14px; border-radius:8px; font-size:0.84rem; font-weight:600; text-decoration:none;">🗺️ Open in Google Maps ↗</a>
        </div>
      `;
    } else {
      mapContainer.style.display = 'none';
    }
  }

  if (document.getElementById('displayBankName')) document.getElementById('displayBankName').textContent = translateBankName(selectedFacility.bank_name);
  if (document.getElementById('displayBankAccount')) document.getElementById('displayBankAccount').textContent = selectedFacility.bank_account || '-';
  if (document.getElementById('displayAccountName')) document.getElementById('displayAccountName').textContent = selectedFacility.account_name || '-';

  const addonsSec = document.getElementById('bookingAddonsSection');
  const addonsList = document.getElementById('bookingAddonsList');
  if (addonsSec && addonsList) {
    const { data: eqData } = await supabaseClient.from('equipment').select('*').eq('facility_id', facilityId).gt('stock', 0);
    currentFacilityEquipment = eqData || [];
    if (currentFacilityEquipment.length > 0) {
      addonsSec.style.display = 'block';
      addonsList.innerHTML = currentFacilityEquipment.map(eq => {
        const isRent = isRentEquipment(eq.type);
        const typeLabel = translateEqType(eq.type);
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
          <div><div style="font-size:0.85rem; font-weight:600;">${eq.name}<span style="font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:10px; margin-left:6px; ${isRent ? 'background:#e0f2fe; color:#0369a1;' : 'background:#d1fae5; color:#047857;'}">${typeLabel}</span></div><div style="font-size:0.75rem; color:var(--text-secondary);">฿${Number(eq.price || 0).toLocaleString()} | Type: ${typeLabel}</div></div>
          <div style="display:flex; align-items:center; gap:10px; background:#f8fafc; border-radius:6px; padding:2px;">
            <button type="button" onclick="updateAddonQty('${eq.id}', -1, ${eq.stock})" style="width:28px; height:28px; border:none; background:#fff; border-radius:4px; font-weight:bold; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1);">-</button>
            <span id="qty_${eq.id}" style="width:16px; text-align:center; font-size:0.85rem; font-weight:700;">0</span>
            <button type="button" onclick="updateAddonQty('${eq.id}', 1, ${eq.stock})" style="width:28px; height:28px; border:none; background:var(--primary); color:white; border-radius:4px; font-weight:bold; cursor:pointer;">+</button>
          </div>
        </div>
      `;
      }).join('');
    } else {
      addonsSec.style.display = 'none';
    }
  }

  selectedDate = new Date();
  calendarMonth = new Date();
  renderCalendar();
  await renderTimeSlots();
  updateSummary();
  switchView('booking');
}

function moveFacilitySlider(direction) {
  if (!selectedFacility || !selectedFacility.images || selectedFacility.images.length <= 1) return;
  const slider = document.getElementById('bookingImageSlider');
  if (!slider) return;
  const totalSlides = slider.querySelectorAll('.slide-item').length;
  if (totalSlides <= 1) return;
  currentSlideIndex = (currentSlideIndex + direction + totalSlides) % totalSlides;
  updateSliderPosition();
}
function setSlide(index) { currentSlideIndex = index; updateSliderPosition(); }
function updateSliderPosition() {
  const slider = document.getElementById('bookingImageSlider');
  if (!slider) return;
  slider.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  document.querySelectorAll('#sliderDots .slider-dot').forEach((dot, index) => {
    if (index === currentSlideIndex) dot.classList.add('active'); else dot.classList.remove('active');
  });
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
  document.getElementById('calendarMonth').textContent = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="day-label">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += '<div class="day-cell disabled"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    let cls = 'day-cell';
    if (date < today) cls += ' disabled';
    if (date.toDateString() === today.toDateString()) cls += ' today';
    if (date.toDateString() === selectedDate.toDateString()) cls += ' selected';
    html += `<div class="${cls}" onclick="${date < today ? '' : `selectDate(${year},${month},${d})`}">${d}</div>`;
  }
  grid.innerHTML = html;
}

async function selectDate(y, m, d) {
  selectedDate = new Date(y, m, d);
  selectedSlots = [];
  renderCalendar();
  await renderTimeSlots();
  updateSummary();
}
function changeMonth(dir) { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + dir, 1); renderCalendar(); }

// ============ SLOT / STOCK HELPERS (Works with RLS: customers don't read bookings table directly) ============
async function fetchBookedSlotsPublic(facilityId, dateStr) {
  const { data, error } = await supabaseClient.rpc('get_booked_slots', { p_facility_id: String(facilityId), p_date: String(dateStr) });
  if (!error && Array.isArray(data)) return data;
  const res = await supabaseClient.from('bookings').select('start_time, end_time, addons, payment_status').eq('facility_id', facilityId).eq('date', dateStr).neq('payment_status', 'rejected');
  return res.data || [];
}
async function decrementEquipmentStock(eqId, qty) {
  const { error } = await supabaseClient.rpc('decrement_equipment_stock', { p_id: String(eqId), p_qty: Number(qty) });
  if (!error) return;
  const { data: eq } = await supabaseClient.from('equipment').select('stock').eq('id', eqId).single();
  if (eq) await supabaseClient.from('equipment').update({ stock: Math.max(0, eq.stock - qty) }).eq('id', eqId);
}

async function renderTimeSlots() {
  const grid = document.getElementById('timeSlotsGrid');
  if (!grid || !selectedFacility) return;
  grid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-tertiary); grid-column:1/-1;">Loading available time slots...</p>';
  const dateStr = formatYMD(selectedDate);
  const bookingsData = await fetchBookedSlotsPublic(selectedFacility.id, dateStr);
  const { data: blocksData } = await supabaseClient.from('time_blocks').select('blocked_start, blocked_end').eq('facility_id', selectedFacility.id).eq('date', dateStr);

  const bookings = bookingsData || [];
  const blocks = blocksData || [];
  const hours = [];
  for (let h = 6; h <= 21; h++) hours.push(`${h.toString().padStart(2, '0')}:00`);
  const now = new Date();
  const isToday = selectedDate.toDateString() === now.toDateString();

  grid.innerHTML = hours.map(h => {
    const hourNum = parseInt(h);
    const isBooked = bookings.some(b => hourNum >= parseInt(b.start_time) && hourNum < parseInt(b.end_time));
    const isBlockedByAdmin = blocks.some(b => hourNum >= parseInt(b.blocked_start) && hourNum < parseInt(b.blocked_end));
    const isPastHour = isToday && hourNum <= now.getHours();
    const isUnavailable = isBooked || isBlockedByAdmin || isPastHour;
    const isSelected = selectedSlots.includes(h);

    let cls = 'time-slot';
    if (isUnavailable) cls += ' blocked'; else if (isSelected) cls += ' selected';
    const clickAttr = isUnavailable ? '' : `onclick="toggleSlot('${h}')"`;

    let statusLabel = ''; let customStyle = '';
    if (isBlockedByAdmin) {
      statusLabel = '<br><span style="font-size:0.68rem; color:#d97706; font-weight:700; display:inline-block; text-decoration:none;">(Maintenance)</span>';
      customStyle = 'style="background:#fefce8; border-color:#fde047; color:#a16207;"';
    } else if (isUnavailable) {
      statusLabel = '<br><span style="font-size:0.65rem; color:var(--error);">(Booked)</span>';
    }
    return `<div class="${cls}" ${customStyle} ${clickAttr}>${h} - ${(hourNum + 1).toString().padStart(2, '0')}:00${statusLabel}</div>`;
  }).join('');
}

async function toggleSlot(time) {
  const idx = selectedSlots.indexOf(time);
  if (idx > -1) selectedSlots.splice(idx, 1); else selectedSlots.push(time);
  selectedSlots.sort();
  renderTimeSlots();
  await checkLiveEquipmentStock(); 
  updateSummary();
}

async function checkLiveEquipmentStock() {
  if (currentFacilityEquipment.length === 0) return;
  const dateStr = formatYMD(selectedDate);
  const todayBookings = (await fetchBookedSlotsPublic(selectedFacility.id, dateStr)).filter(b => ['approved', 'completed', 'pending'].includes(String(b.payment_status || '').toLowerCase()));
  let maxRentedInSelectedSlots = {}; 

  if (todayBookings && selectedSlots.length > 0) {
    selectedSlots.forEach(slotHour => {
      const slotStartNum = parseInt(slotHour);
      let rentedThisHour = {}; 
      const overlappingBookings = todayBookings.filter(b => slotStartNum >= parseInt(b.start_time) && slotStartNum < parseInt(b.end_time));
      overlappingBookings.forEach(b => {
        let addonsData = b.addons;
        if (typeof addonsData === 'string') { try { addonsData = JSON.parse(addonsData); } catch(e) { addonsData = []; } }
        if (addonsData && Array.isArray(addonsData)) {
          addonsData.forEach(addon => {
            if (isRentEquipment(addon.type)) {
              if (!rentedThisHour[addon.id]) rentedThisHour[addon.id] = 0;
              rentedThisHour[addon.id] += Number(addon.qty);
            }
          });
        }
      });
      for (const [eqId, qty] of Object.entries(rentedThisHour)) {
        if (!maxRentedInSelectedSlots[eqId] || qty > maxRentedInSelectedSlots[eqId]) maxRentedInSelectedSlots[eqId] = qty;
      }
    });
  }

  const addonsListEl = document.getElementById('bookingAddonsList');
  if (!addonsListEl) return;
  let html = '';
  currentFacilityEquipment.forEach(eq => {
    let availableStock = eq.stock; 
    const isRent = isRentEquipment(eq.type);
    const typeLabel = translateEqType(eq.type);
    if (isRent && selectedSlots.length > 0) availableStock = Math.max(0, eq.stock - (maxRentedInSelectedSlots[eq.id] || 0)); 
    if (selectedAddons[eq.id] && selectedAddons[eq.id] > availableStock) selectedAddons[eq.id] = availableStock; 

    const currentQtyInCart = selectedAddons[eq.id] || 0;
    const isOutOfStock = availableStock === 0;

    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border:1px solid ${isOutOfStock ? '#fecaca' : (availableStock <= 3 ? '#fde68a' : '#e2e8f0')}; border-radius:8px; opacity: ${isOutOfStock ? '0.6' : '1'};">
        <div>
          <div style="font-size:0.85rem; font-weight:600; text-decoration: ${isOutOfStock ? 'line-through' : 'none'};">${eq.name}
            <span style="font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:10px; margin-left:6px; ${isRent ? 'background:#e0f2fe; color:#0369a1;' : 'background:#d1fae5; color:#047857;'}">${typeLabel}</span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">฿${Number(eq.price || 0).toLocaleString()} | ${typeLabel} <strong style="color:${isOutOfStock ? 'var(--error)' : (availableStock <= 3 ? '#d97706' : '#059669')}; margin-left:4px;">(${isOutOfStock ? 'Out of stock' : `${availableStock} available`})</strong></div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; background:#f8fafc; border-radius:6px; padding:2px;">
          <button type="button" onclick="updateAddonQty('${eq.id}', -1, ${availableStock})" style="width:28px; height:28px; border:none; background:#fff; border-radius:4px; font-weight:bold; cursor:${isOutOfStock ? 'not-allowed' : 'pointer'}; box-shadow:0 1px 2px rgba(0,0,0,0.1);" ${isOutOfStock ? 'disabled' : ''}>-</button>
          <span id="qty_${eq.id}" style="width:16px; text-align:center; font-size:0.85rem; font-weight:700;">${currentQtyInCart}</span>
          <button type="button" onclick="updateAddonQty('${eq.id}', 1, ${availableStock})" style="width:28px; height:28px; border:none; background:var(--primary); color:white; border-radius:4px; font-weight:bold; cursor:${isOutOfStock ? 'not-allowed' : 'pointer'};" ${isOutOfStock ? 'disabled' : ''}>+</button>
        </div>
      </div>
    `;
  });
  addonsListEl.innerHTML = html;
}

function updateAddonQty(eqId, change, maxStock) {
  if (selectedSlots.length === 0) {
     alert('⏰ Please select your preferred "Available Time Slots" first so the system can calculate live equipment availability for those hours.');
     const slotGrid = document.getElementById('timeSlotsGrid');
     if (slotGrid) slotGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
     return;
  }
  if(!selectedAddons[eqId]) selectedAddons[eqId] = 0;
  const newQty = selectedAddons[eqId] + change;
  if(newQty >= 0 && newQty <= maxStock) {
      selectedAddons[eqId] = newQty;
      const qtyEl = document.getElementById(`qty_${eqId}`);
      if (qtyEl) qtyEl.textContent = newQty;
      updateSummary(); 
  } else if (newQty > maxStock) {
      alert(`Sorry, only ${maxStock} unit(s) of this item are available during your selected time slots.`);
  }
}

function updateSummary() {
  const dateStr = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('sumDate').textContent = dateStr;
  let addonTotal = 0;
  for (const [eqId, qty] of Object.entries(selectedAddons)) {
    if (qty > 0) {
      const eq = currentFacilityEquipment.find(e => e.id === eqId);
      if (eq) addonTotal += (eq.price * qty);
    }
  }

  if (selectedSlots.length > 0) {
    const start = selectedSlots[0];
    const lastHour = parseInt(selectedSlots[selectedSlots.length - 1]) + 1;
    const end = lastHour.toString().padStart(2, '0') + ':00';
    document.getElementById('sumTime').textContent = `${start} - ${end}`;
    document.getElementById('sumDuration').textContent = `${selectedSlots.length} hour${selectedSlots.length > 1 ? 's' : ''}`;
    const facilityTotal = selectedSlots.length * (selectedFacility?.price || 0);
    const grandTotal = facilityTotal + addonTotal;
    document.getElementById('sumTotal').textContent = `฿${grandTotal.toLocaleString()}`;
    const transferAmountEl = document.getElementById('displayTransferAmount');
    if (transferAmountEl) transferAmountEl.textContent = document.getElementById('sumTotal').textContent;
  } else {
    document.getElementById('sumTime').textContent = 'Select slots';
    document.getElementById('sumDuration').textContent = '-';
    document.getElementById('sumTotal').textContent = `฿${addonTotal > 0 ? addonTotal.toLocaleString() : '0'}`;
  }
}

let selectedSlipFile = null;
function handleSlipSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image file size exceeds 5MB. Please choose a smaller file.'); return; }
  selectedSlipFile = file;
  const previewBox = document.getElementById('slipUploadBox');
  if (previewBox) {
    previewBox.innerHTML = `
      <div style="text-align:center;">
        <i data-lucide="check-circle" style="color:var(--success); width:32px; height:32px;"></i>
        <p style="margin-top:8px; font-weight:600; font-size:0.85rem;">Payment slip attached</p>
        <span style="font-size:0.75rem; color:var(--text-tertiary);">${file.name}</span>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
}
function resetSlipUploadUI() {
    selectedSlipFile = null;
    const slipInput = document.getElementById('slipUpload');
    if (slipInput) slipInput.value = '';
    const uploadArea = document.getElementById('slipUploadBox');
    if (uploadArea) {
        uploadArea.innerHTML = `
            <i data-lucide="upload-cloud" width="28" height="28"></i>
            <p>Click to select payment slip image</p>
            <p style="font-size:0.72rem; color:var(--text-tertiary); margin-top:4px">PNG, JPG up to 5MB</p>
        `;
        if (window.lucide) lucide.createIcons();
    }
    const customerNameInput = document.getElementById('bookingCustomerName');
    const customerPhoneInput = document.getElementById('bookingCustomerPhone');
    if(customerNameInput) customerNameInput.value = currentUser?.profile?.name || '';
    if(customerPhoneInput) customerPhoneInput.value = currentUser?.profile?.phone || '';
}

// ===== Automated AI Payment Slip Verification =====
// Called via server endpoint /api/verify-slip (Gemini API key is stored server-side only)
async function verifySlipWithAI(file, expectedAmount) {
  try {
    // 1) Convert slip image to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // 2) Attach Supabase session token to authenticate request
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('not logged in');

    // 3) Send to server for AI verification
    const res = await fetch('/api/verify-slip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ image_base64: base64, mime_type: file.type || 'image/jpeg', expected_amount: Number(expectedAmount) })
    });
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch (e) {}
      throw new Error('verify-slip HTTP ' + res.status + ' ' + detail);
    }
    return await res.json();   // { approved, has_slip, amount }
  } catch (err) {
    console.warn('Slip AI verification error:', err);
    return null;
  }
}

async function autoVerifySlipAndApprove(slipFile, bookingIds, totalAmount) {
  const verdict = await verifySlipWithAI(slipFile, totalAmount);
  let approved = false;
  if (verdict && verdict.approved === true) {
    approved = await approveBookingPayments(bookingIds);
  }
  // Refresh bookings list to reflect updated status
  try { if (typeof renderMyBookings === 'function') await renderMyBookings(); } catch (e) {}
  if (approved) alert('✅ Payment slip verified! Your booking has been automatically approved.');
  else if (verdict) alert('⚠️ Automated slip verification could not approve this slip (amount mismatch or unrecognized slip). An administrator will review it shortly.');
  else alert('⚠️ Automated slip verification is currently unavailable. Your booking is pending manual review by an administrator.');
  return approved;
}

async function approveBookingPayments(bookingIds) {
  if (!bookingIds || bookingIds.length === 0) return false;
  try {
    const { error } = await supabaseClient.from('bookings')
      .update({ payment_status: 'approved' })
      .in('id', bookingIds);
    if (error) { console.warn('Auto-approve failed:', error.message); return false; }
    await supabaseClient.from('payments')
      .update({ status: 'approved' })
      .in('booking_id', bookingIds);
    // Re-render views immediately
    await renderMyBookings();
    if (typeof renderPaymentsTable === 'function') renderPaymentsTable();
    return true;
  } catch (e) {
    console.warn('Auto-approve error:', e);
    return false;
  }
}

async function pollBookingApproval(bookingIds, maxTries, intervalMs) {
  for (let i = 0; i < maxTries; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const { data } = await supabaseClient.from('bookings')
        .select('id, payment_status').in('id', bookingIds);
      if (data && data.length > 0 && data.every(b => String(b.payment_status).toLowerCase() === 'approved')) {
        await renderMyBookings();
        return true;
      }
    } catch (e) { /* skip and retry */ }
  }
  return false;
}

async function confirmBooking() {
  const customerName = document.getElementById('bookingCustomerName')?.value.trim();
  const customerPhone = document.getElementById('bookingCustomerPhone')?.value.trim();
  if (!customerName || !customerPhone) { alert('Please enter your name and phone number'); return; }
  if (selectedSlots.length === 0) { alert('Please select at least one time slot'); return; }
  if (!selectedSlipFile) { alert('Please upload your payment slip'); return; }

  const btn = document.querySelector('#view-booking .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Uploading & verifying slip with AI...'; }

  try {
    const rawExt = (selectedSlipFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileExt = rawExt || 'jpg';
    const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
    const filePath = `slips/${fileName}`;
    const { error: uploadErr } = await supabaseClient.storage.from('payment-slips').upload(filePath, selectedSlipFile, {
      upsert: true,
      contentType: selectedSlipFile.type || 'image/jpeg'
    });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabaseClient.storage.from('payment-slips').getPublicUrl(filePath);
    const slipUrl = String(urlData?.publicUrl || '').trim();
    if (!slipUrl.startsWith('http')) throw new Error('Unable to generate public URL for payment slip');

    const dateStr = formatYMD(selectedDate);
    const addonsToSave = [];
    let addonTotal = 0;
    for (const [eqId, qty] of Object.entries(selectedAddons)) {
      if (qty > 0) {
        const eq = currentFacilityEquipment.find(e => e.id === eqId);
        if (eq) { addonTotal += eq.price * qty; addonsToSave.push({ id: eq.id, name: eq.name, type: eq.type, price: eq.price, qty: qty }); }
      }
    }

    const bookingInserts = selectedSlots.map((slot, index) => {
      const startHour = parseInt(slot);
      let slotPrice = selectedFacility?.price || 0;
      if (index === 0) slotPrice += addonTotal;
      return {
        user_id: currentUser.id,
        facility_id: selectedFacility.id,
        date: dateStr,
        start_time: `${startHour.toString().padStart(2, '0')}:00`,
        end_time: `${(startHour + 1).toString().padStart(2, '0')}:00`,
        total_price: slotPrice,
        payment_status: 'pending',
        slip_url: slipUrl,
        customer_name: customerName,
        customer_phone: customerPhone,
        addons: addonsToSave
      };
    });

    const { data: bookingData, error: bookingErr } = await supabaseClient.from('bookings').insert(bookingInserts).select();
    if (bookingErr) throw bookingErr;

    for (const addon of addonsToSave) {
      if (isBuyEquipment(addon.type)) {
        await decrementEquipmentStock(addon.id, addon.qty);
      }
    }

    const totalAmount = (selectedSlots.length * (selectedFacility?.price || 0)) + addonTotal;
    const bookingIds = (bookingData || []).map(b => b.id);
    if (bookingData && bookingData.length > 0) {
      await supabaseClient.from('payments').insert([{ booking_id: bookingData[0].id, amount: totalAmount, slip_url: slipUrl, status: 'pending' }]);
    }

    // Verify slip with AI (Gemini) and auto-approve if valid
    autoVerifySlipAndApprove(selectedSlipFile, bookingIds, totalAmount);

    selectedSlots = []; 
    resetSlipUploadUI(); 
    await renderTimeSlots(); 
    await renderMyBookings();
    alert('Booking request and payment slip submitted successfully!');
    switchView('my-bookings');

  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Facility Booking'; }
  }
}

function groupBookingsIntoBills(rawBookings) {
  const groups = {};
  (rawBookings || []).forEach(b => {
    const timeKey = b.created_at ? b.created_at.slice(0, 19) : '';
    const key = (b.slip_url && b.slip_url !== 'walk-in')
      ? `slip_${b.slip_url}_${b.facility_id}_${b.date}`
      : `group_${b.user_id}_${b.facility_id}_${b.date}_${b.customer_name || ''}_${b.customer_phone || ''}_${timeKey}`;

    if (!groups[key]) {
      groups[key] = {
        groupId: b.id, bookingIds: [], facility_id: b.facility_id, user_id: b.user_id, date: b.date,
        slots: [], total_price: 0, payment_status: b.payment_status, slip_url: b.slip_url,
        customer_name: b.customer_name || '-', customer_phone: b.customer_phone || '-', addons: b.addons || []
      };
    }
    groups[key].bookingIds.push(b.id);
    groups[key].slots.push({ id: b.id, start: (b.start_time || '').slice(0, 5), end: (b.end_time || '').slice(0, 5), status: (b.payment_status || 'pending').toLowerCase() });
    groups[key].total_price += Number(b.total_price || 0);
  });

  return Object.values(groups).map(g => {
    g.slots.sort((a, b) => a.start.localeCompare(b.start));
    const completedCount = g.slots.filter(s => s.status === 'completed').length;
    const approvedCount = g.slots.filter(s => s.status === 'approved').length;
    const pendingCount = g.slots.filter(s => s.status === 'pending').length;
    const rejectedCount = g.slots.filter(s => s.status === 'rejected').length;

    g.completedCount = completedCount; g.totalSlots = g.slots.length;
    g.isAllCompleted = (completedCount === g.slots.length && g.slots.length > 0);
    g.isPartiallyCheckedIn = (completedCount > 0 && completedCount < g.slots.length);

    if (g.isAllCompleted) g.payment_status = 'completed';
    else if (rejectedCount === g.slots.length) g.payment_status = 'rejected';
    else if (pendingCount > 0) g.payment_status = 'pending';
    else if (approvedCount > 0 || completedCount > 0) g.payment_status = 'approved';
    groupedBookingsCache[g.groupId] = g;
    return g;
  });
}

async function renderMyBookings() {
  const list = document.getElementById('myBookingsList');
  if (!list) return;
  const qrSection = document.getElementById('qrSection'); if (qrSection) qrSection.style.display = 'none';
  list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">Loading your bookings...</p>';

  try {
    let userId = currentUser?.id || currentUser?.user_id;
    if (!userId) { list.innerHTML = '<p style="color:var(--text-tertiary);">Please sign in</p>'; return; }

    const { data: bookings, error } = await supabaseClient.from('bookings').select('*').eq('user_id', userId).in('payment_status', ['pending', 'PENDING', 'approved', 'APPROVED', 'completed', 'COMPLETED']).order('created_at', { ascending: false });
    if (error) { console.error('[myBookings] query error:', error); list.innerHTML = '<p style="color:var(--error); text-align:center; padding:32px;">Failed to load bookings: ' + (error.message || '') + '</p>'; return; }
    if (!bookings || bookings.length === 0) { list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">No upcoming bookings</p>'; return; }

    const allBills = groupBookingsIntoBills(bookings);
    const activeBills = allBills.filter(b => !b.isAllCompleted && b.payment_status !== 'rejected' && !String(b.slip_url || '').startsWith('walkin_'));

    if (activeBills.length === 0) { list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">No upcoming bookings</p>'; return; }

    list.innerHTML = activeBills.map(bill => {
    const facility = FACILITIES.find(f => String(f.id) === String(bill.facility_id)) || { name: 'Sports Facility' };
    const statusLower = (bill.payment_status || 'pending').toLowerCase();
    const slotBadges = bill.slots.map(s => {
      if (s.status === 'completed') return `<span style="display:inline-block; background:#dbeafe; color:#1d4ed8; padding:3px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid #93c5fd; margin-right:6px; margin-top:4px;">✓ ${s.start} - ${s.end} (Used)</span>`;
      else if (s.status === 'approved') return `<span style="display:inline-block; background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid #86efac; margin-right:6px; margin-top:4px;">⏰ ${s.start} - ${s.end} (Ready to Check-in)</span>`;
      else return `<span style="display:inline-block; background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid #fde047; margin-right:6px; margin-top:4px;">⏳ ${s.start} - ${s.end} (Pending Approval)</span>`;
    }).join('');

    const progressBadge = bill.isPartiallyCheckedIn ? `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 10px; border-radius:20px; font-size:0.74rem; font-weight:700;">Checked in ${bill.completedCount}/${bill.totalSlots} slots</span>` : `<span class="status-badge ${statusLower}">${statusLower.toUpperCase()}</span>`;

    return `
      <div class="booking-card" onclick="openBookingTicketModal('${bill.groupId}', false)" style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <h4 style="margin:0; font-size:1.05rem;">${facility.name}</h4>
            <span style="font-size:0.78rem; color:var(--primary); font-weight:600;">(${bill.slots.length} hr${bill.slots.length > 1 ? 's' : ''} · ฿${bill.total_price.toLocaleString()})</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin:0 0 6px 0;">📅 Date: <strong>${bill.date}</strong> | 👤 Booked by: ${bill.customer_name} (${bill.customer_phone})</p>
          <div>${slotBadges}</div>
          <div style="margin-top:10px; font-size:0.8rem; color:var(--primary); font-weight:600;">🎫 Click to open E-Ticket (View hourly status) →</div>
        </div>
        <div>${progressBadge}</div>
      </div>
    `;
  }).join('');
  } catch (err) {
    console.error('[myBookings] render failed:', err);
    list.innerHTML = '<p style="color:var(--error); text-align:center; padding:32px;">Error loading bookings: ' + (err.message || err) + '</p>';
  }
}

// ============================================================
// 🔲 Staff Check-In Scanner: Scan QR from customer ticket or search by Name / Phone / Booking Ref
// ============================================================

let html5ScannerInstance = null;
let html5ScannerRunning = false;

// Scan QR with camera (using html5-qrcode library)
async function toggleCameraQrScan() {
  const readerDiv = document.getElementById('qrCameraReader');
  const btn = document.getElementById('cameraScanBtn');
  if (!readerDiv) return;
  if (html5ScannerRunning) { await stopCameraQrScan(); return; }
  if (typeof Html5Qrcode === 'undefined') { alert('QR scanner library is not loaded yet. Please refresh the page.'); return; }
  try {
    html5ScannerInstance = new Html5Qrcode('qrCameraReader');
    await html5ScannerInstance.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        await stopCameraQrScan();
        const input = document.getElementById('scannerQuery');
        if (input) input.value = decodedText;
        await searchCheckInBookings();
      },
      () => { /* ignore frame errors */ });
    html5ScannerRunning = true;
    readerDiv.style.display = 'block';
    if (btn) btn.textContent = '⏹ Stop Camera Scan';
  } catch (err) {
    alert('Unable to access camera: ' + (err?.message || err));
    html5ScannerInstance = null;
  }
}

async function stopCameraQrScan() {
  try { if (html5ScannerInstance && html5ScannerRunning) await html5ScannerInstance.stop(); } catch (e) {}
  html5ScannerRunning = false;
  html5ScannerInstance = null;
  const readerDiv = document.getElementById('qrCameraReader');
  const btn = document.getElementById('cameraScanBtn');
  if (readerDiv) { readerDiv.style.display = 'none'; readerDiv.innerHTML = ''; }
  if (btn) btn.textContent = '📷 Scan QR with Camera';
}

async function searchCheckInBookings() {
  const box = document.getElementById('scannerResults');
  const raw = (document.getElementById('scannerQuery')?.value || '').trim();
  if (!box) return;
  if (!raw) { alert('Please enter a phone number, customer name, booking ref, or scan a QR code first.'); return; }

  let verifiedFromQr = null;
  let searchTerm = raw;
  // Check if scanned string is a Sport Circle ticket QR payload
  if (raw.startsWith('SC-TICKET|')) {
    const parts = raw.split('|');
    if (parts.length >= 5) {
      // parts: [0]=SC-TICKET, [1]=ref, [2]=date, [3]=phone, [4]=name, [5]=facility name
      verifiedFromQr = { ref: parts[1], date: parts[2], phone: parts[3], name: parts[4], facility: parts[5] || '' };
      searchTerm = verifiedFromQr.ref;
    }
  }

  box.innerHTML = '<p style="text-align:center; padding:24px; color:var(--text-tertiary);">Searching bookings...</p>';
  try {
    let query = supabaseClient.from('bookings').select('*').in('payment_status', ['pending', 'approved', 'completed']);
    if (verifiedFromQr) query = query.eq('id', verifiedFromQr.ref);
    else query = query.or(`customer_phone.eq.${searchTerm},customer_name.ilike.%${searchTerm}%,id.eq.${searchTerm}`);
    const { data: bookings, error } = await query.order('date', { ascending: true }).order('start_time', { ascending: true });
    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      box.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-tertiary);">🔍 No bookings found matching "${raw}"</div>`;
      return;
    }

    const bills = groupBookingsIntoBills(bookings);
    let verifyBanner = '';
    let qrMatchedBill = null;
    if (verifiedFromQr) {
      const match = bills.find(b => String(b.groupId) === String(verifiedFromQr.ref));
      if (match) {
        qrMatchedBill = match;
        const fac = FACILITIES.find(f => String(f.id) === String(match.facility_id));
        const facName = fac ? fac.name : 'Sports Facility';
        verifyBanner = `<div style="background:#f0fdf4; border:1px solid #86efac; color:#15803d; padding:12px 16px; border-radius:10px; margin-bottom:14px; font-weight:700;">✅ QR Scan Verified — Booking Found (Ref: #${match.groupId})<div style="font-size:0.95rem; font-weight:800; margin-top:6px;">🏟️ Facility: <u>${facName}</u></div><div style="font-size:0.8rem; font-weight:500; margin-top:4px;">Please verify customer name and phone number before checking in.</div></div>`;
        // Open booking ticket modal automatically in staff mode
        setTimeout(() => openBookingTicketModal(match.groupId, true), 250);
      } else {
        verifyBanner = `<div style="background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:12px 16px; border-radius:10px; margin-bottom:14px; font-weight:700;">⚠️ QR code does not match any active booking in the system. Please check again.</div>`;
      }
    }

    box.innerHTML = verifyBanner + bills.map(bill => {
      const facility = FACILITIES.find(f => String(f.id) === String(bill.facility_id)) || { name: 'Sports Facility', sport: '' };
      const remaining = bill.slots.filter(s => s.status === 'approved').length;
      const pendingOnly = bill.slots.every(s => s.status === 'pending');
      const statusHtml = bill.isAllCompleted
        ? '<span style="background:#dbeafe; color:#1d4ed8; padding:4px 12px; border-radius:12px; font-size:0.78rem; font-weight:700;">✓ All Slots Completed</span>'
        : `<span class="status-badge ${(bill.payment_status || 'pending').toLowerCase()}">${(bill.payment_status || 'pending').toUpperCase()}</span>`;
      const slotRows = bill.slots.map(s => {
        const st = s.status === 'completed'
          ? '<span style="background:#dbeafe; color:#1d4ed8; padding:2px 10px; border-radius:10px; font-size:0.75rem; font-weight:700;">✓ Checked In</span>'
          : s.status === 'approved'
            ? '<span style="background:#dcfce7; color:#15803d; padding:2px 10px; border-radius:10px; font-size:0.75rem; font-weight:700;">Ready to Check-in</span>'
            : '<span style="background:#fef9c3; color:#a16207; padding:2px 10px; border-radius:10px; font-size:0.75rem; font-weight:700;">Pending Approval</span>';
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:0.88rem;"><span>⏰ <strong>${s.start} - ${s.end}</strong></span>${st}</div>`;
      }).join('');
      return `
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px;">
          ${verifiedFromQr ? `<div style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:10px 14px; border-radius:10px; font-weight:800; font-size:0.95rem; margin-bottom:12px;">✅ QR Identity Verified — Booked by <u>${bill.customer_name}</u></div>` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div><strong style="font-size:1.05rem;">🏟️ ${facility.name}</strong>
              <span style="font-size:0.8rem; color:var(--text-secondary);">· Booking Ref #${bill.groupId}</span></div>
            ${statusHtml}
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:12px; font-size:0.9rem; display:grid; grid-template-columns:1fr 1fr; gap:8px 16px;">
            <div>👤 <span style="color:var(--text-tertiary); font-size:0.8rem;">Customer:</span> <strong>${bill.customer_name}</strong></div>
            <div>☎️ <span style="color:var(--text-tertiary); font-size:0.8rem;">Phone:</span> <strong>${bill.customer_phone}</strong></div>
            <div>🏟️ <span style="color:var(--text-tertiary); font-size:0.8rem;">Facility:</span> <strong>${facility.name}</strong>${facility.sport ? ` <span style="font-size:0.75rem; color:var(--text-secondary);">(${facility.sport})</span>` : ''}</div>
            <div>📅 <span style="color:var(--text-tertiary); font-size:0.8rem;">Date:</span> <strong>${bill.date}</strong></div>
          </div>
          <div style="margin-bottom:10px;">
            <div style="font-size:0.82rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">⏰ Booked Slots (${bill.slots.length})</div>
            ${slotRows}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px dashed #cbd5e1; font-size:0.9rem;">
            <span>Total Amount: <strong>฿${bill.total_price.toLocaleString()}</strong></span>
            ${bill.isPartiallyCheckedIn ? `<span style="font-size:0.78rem; color:#1d4ed8; font-weight:700;">Checked in ${bill.completedCount}/${bill.totalSlots} slots</span>` : ''}
          </div>
          <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
            <button class="btn" style="background:#2563eb; color:white; padding:6px 14px; border-radius:6px; font-size:0.82rem;" onclick="openBookingTicketModal('${bill.groupId}', true)">🎫 Open Ticket / Details</button>
            ${(!bill.isAllCompleted && remaining > 0 && !pendingOnly) ? `<button class="btn" style="background:#22c55e; color:white; padding:6px 14px; border-radius:6px; font-size:0.82rem;" onclick="checkInFromScanner('${bill.groupId}')">✅ Confirm & Check In All (${remaining} hr${remaining > 1 ? 's' : ''})</button>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('[scanner] search failed:', err);
    box.innerHTML = `<div style="text-align:center; padding:24px; color:var(--error);">Error: ${err.message || err}</div>`;
  }
}

async function checkInFromScanner(groupId) {
  const bill = groupedBookingsCache[groupId];
  if (!bill) { alert('Booking record not found. Please search again.'); return; }
  await confirmGroupCheckIn(groupId);
  // Refresh search results after check-in
  if (document.getElementById('scannerQuery')?.value) await searchCheckInBookings();
}

function previewSlipModal(slipUrl) {
  if (!slipUrl || slipUrl === 'walk-in' || slipUrl === '#') { alert('No payment slip image available for this booking.'); return; }
  let viewer = document.getElementById('slipImageViewerOverlay');
  if (!viewer) {
    viewer = document.createElement('div'); viewer.id = 'slipImageViewerOverlay';
    viewer.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:30000; display:flex; align-items:center; justify-content:center; padding:20px;';
    document.body.appendChild(viewer);
  }
  viewer.innerHTML = `
    <div style="position:relative; background:#fff; padding:16px; border-radius:14px; max-width:420px; width:100%; max-height:90vh; display:flex; flex-direction:column; align-items:center; box-shadow:0 12px 32px rgba(0,0,0,0.4);">
      <button type="button" onclick="closeSlipModal()" style="position:absolute; top:-12px; right:-12px; width:34px; height:34px; border-radius:50%; background:#ef4444; color:#fff; border:2px solid #fff; font-size:18px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.3);">✕</button>
      <h4 style="margin:0 0 12px 0; font-size:0.95rem; color:#1e293b;">Payment Transfer Slip</h4>
      <div style="width:100%; max-height:72vh; overflow-y:auto; text-align:center; background:#f8fafc; border-radius:8px; padding:8px; border:1px solid #e2e8f0;">
        <img src="${slipUrl}" alt="Payment Slip" style="max-width:100%; height:auto; border-radius:6px; display:block; margin:0 auto;" />
      </div>
    </div>`;
  viewer.style.display = 'flex';
}
function closeSlipModal() { const viewer = document.getElementById('slipImageViewerOverlay'); if (viewer) viewer.style.display = 'none'; }

async function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">Loading booking history...</p>';
  let userId = currentUser?.id || currentUser?.user_id;
  if (!userId) { list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">Please sign in</p>'; return; }
  const { data: userBookings, error } = await supabaseClient.from('bookings').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error || !userBookings || userBookings.length === 0) { list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">No past facility visits yet</p>'; return; }

  const allBills = groupBookingsIntoBills(userBookings);
  const completedBills = allBills.filter(b => b.isAllCompleted && !String(b.slip_url || '').startsWith('walkin_'));
  if (completedBills.length === 0) { list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">No past facility visits yet</p>'; return; }

  list.innerHTML = completedBills.map(bill => {
    const facility = FACILITIES.find(f => String(f.id) === String(bill.facility_id)) || { name: 'Sports Facility' };
    const slotBadges = bill.slots.map(s => `<span style="display:inline-block; background:#f1f5f9; color:#334155; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; margin-right:6px; margin-top:4px;">✓ ${s.start} - ${s.end}</span>`).join('');
    return `
      <div class="booking-card" onclick="openBookingTicketModal('${bill.groupId}', false)" style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
        <div>
          <h4 style="margin:0 0 4px 0;">${facility.name} <span style="font-size:0.8rem; color:var(--text-secondary);">(${bill.slots.length} hr${bill.slots.length > 1 ? 's' : ''} · ฿${bill.total_price.toLocaleString()})</span></h4>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin:0 0 4px 0;">📅 ${bill.date || '-'} | 👤 ${bill.customer_name} (${bill.customer_phone})</p>
          <div>${slotBadges}</div>
        </div>
        <span class="status-badge completed" style="background:#dcfce7; color:#15803d; padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:600;">COMPLETED</span>
      </div>
    `;
  }).join('');
}

let ownerProfilesCache = [];
async function loadOwnerProfiles() {
  const { data, error } = await supabaseClient.from('profiles').select('id, name, role').in('role', ['owner', 'admin']);
  ownerProfilesCache = error ? [] : (data || []);
}

async function assignFacilityOwner(facilityId, newOwnerId) {
  if (currentRole !== 'admin') { alert('Only Administrators can reassign facility ownership'); return; }
  const fac = FACILITIES.find(f => String(f.id) === String(facilityId));
  const target = ownerProfilesCache.find(o => String(o.id) === String(newOwnerId));
  if (!confirm(`Reassign facility "${fac?.name || facilityId}" to ${target ? target.name : 'Unassigned'}?`)) { renderFacilitiesTable(); return; }
  const ownerValue = newOwnerId || null;
  const { error } = await supabaseClient.from('facilities').update({ owner_id: ownerValue }).eq('id', facilityId);
  if (error) { alert('Failed to change owner: ' + error.message); renderFacilitiesTable(); return; }
  await supabaseClient.from('equipment').update({ owner_id: ownerValue }).eq('facility_id', facilityId);
  if (fac) fac.owner_id = ownerValue;
  renderFacilitiesTable();
}

function renderFacilitiesTable() {
  const tbody = document.getElementById('facilitiesTable');
  if (!tbody) return;
  const isAdmin = (currentRole === 'admin');
  const titleEl = document.getElementById('manageFacTitle');
  const subEl = document.getElementById('manageFacSubtitle');
  const ownerTh = document.getElementById('facOwnerTh');
  const actionsTh = document.getElementById('facActionsTh');
  const addFacBtn = document.getElementById('addFacilityBtn');

  if (titleEl) titleEl.textContent = isAdmin ? 'System Facility Directory & Ownership Governance' : 'My Sports Facilities';
  if (subEl) subEl.textContent = isAdmin
    ? 'Platform-wide facility registry: audit venue status and assign or transfer Court Owner permissions (Read-only venue operations)'
    : 'Add, edit, or manage equipment inventory for your sports facilities';
  if (ownerTh) ownerTh.style.display = isAdmin ? '' : 'none';
  if (actionsTh) actionsTh.style.display = isAdmin ? 'none' : '';
  if (addFacBtn) addFacBtn.style.display = isAdmin ? 'none' : '';

  const managedList = isAdmin ? (FACILITIES || []) : getMyManagedFacilities();
  if (managedList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-tertiary);">${isAdmin ? 'No sports facilities registered on the platform yet' : 'No sports facilities under your management yet'}</td></tr>`;
    return;
  }
  tbody.innerHTML = managedList.map(f => {
    const ownerCell = isAdmin
      ? `<td><select class="owner-select ${f.owner_id ? '' : 'owner-select-empty'}" onchange="assignFacilityOwner('${f.id}', this.value)">
           <option value="">— Unassigned —</option>
           ${ownerProfilesCache.map(o => `<option value="${escPlat(o.id)}" ${String(o.id) === String(f.owner_id || '') ? 'selected' : ''}>${escPlat(o.name || o.id)}${o.role === 'admin' ? ' (admin)' : ''}</option>`).join('')}
         </select></td>`
      : '';
    const actionsCell = isAdmin
      ? ''
      : `<td>
          <div class="table-actions" style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn" style="background:#0f766e; color:white; padding:5px 8px; font-size:0.7rem;" onclick="openEquipmentModal('${f.id}')">📦 Equipment</button>
            <button class="approve-btn" onclick="openEditFacilityModal('${f.id}')">Edit</button>
            <button class="reject-btn" onclick="deleteFacility('${f.id}')">Remove</button>
          </div>
        </td>`;
    return `
    <tr>
      <td><strong>${escPlat(f.name)}</strong><div style="font-size:0.75rem; color:var(--text-secondary);">📍 ${escPlat(translateProvince(f.province))}</div></td>
      <td>${escPlat((f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1))}</td>
      <td>฿${Number(f.price || 0).toLocaleString()}</td>
      <td><span class="status-badge ${f.status === 'available' ? 'approved' : 'pending'}">${escPlat(f.status || 'available')}</span></td>
      ${ownerCell}
      ${actionsCell}
    </tr>`;
  }).join('');
}

// ============ ADMIN: Platform Overview, User Governance, Issue Reports & Audit Logs ============
let currentPlatformSubTab = 'all'; // 'all' | 'owners' | 'users' | 'facilities' | 'issues' | 'audit'
let platformAuditBookingsCache = [];

function setupPlatformCombinedLayout() {
  const platView = document.getElementById('view-platform');
  const usersView = document.getElementById('view-users');
  const facView = document.getElementById('view-manage-facilities');
  const mainContent = document.querySelector('.main-content');
  if (!platView) return;

  if (currentRole === 'admin') {
    let tabBar = document.getElementById('platformSubTabs');
    const kpiBox = document.getElementById('platformKpis');
    if (!tabBar && kpiBox) {
      tabBar = document.createElement('div');
      tabBar.id = 'platformSubTabs';
      tabBar.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; margin:20px 0 16px 0; padding-bottom:12px; border-bottom:1px solid var(--border);';
      tabBar.innerHTML = `
        <button type="button" class="btn plat-tab-btn" data-ptab="all" onclick="switchPlatformSubTab('all')" style="background:var(--primary); color:#fff; padding:8px 16px; border-radius:999px; font-size:0.84rem;">📋 All Modules</button>
        <button type="button" class="btn plat-tab-btn" data-ptab="owners" onclick="switchPlatformSubTab('owners')" style="background:#fff; color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:999px; font-size:0.84rem;">📊 Owners &amp; Venues</button>
        <button type="button" class="btn plat-tab-btn" data-ptab="users" onclick="switchPlatformSubTab('users')" style="background:#fff; color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:999px; font-size:0.84rem;">👥 User &amp; Role Management</button>
        <button type="button" class="btn plat-tab-btn" data-ptab="issues" onclick="switchPlatformSubTab('issues')" style="background:#fff; color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:999px; font-size:0.84rem;">🚩 System Issue Reports <span id="issueTabBadge" style="display:none; background:#dc2626; color:#fff; border-radius:999px; padding:1px 8px; font-size:0.72rem; margin-left:4px;">0</span></button>
        <button type="button" class="btn plat-tab-btn" data-ptab="audit" onclick="switchPlatformSubTab('audit')" style="background:#fff; color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:999px; font-size:0.84rem;">🛡️ Audit Logs &amp; Config</button>
      `;
      kpiBox.insertAdjacentElement('afterend', tabBar);
    }

    // Attach Admin sections inside Platform View
    if (usersView && usersView.parentElement !== platView) {
      usersView.style.marginTop = '28px';
      platView.appendChild(usersView);
    }
    if (facView && facView.parentElement !== platView) {
      facView.style.marginTop = '28px';
      platView.appendChild(facView);
    }
    if (!document.getElementById('platformIssuesSection')) {
      const sec = document.createElement('div');
      sec.id = 'platformIssuesSection';
      sec.style.marginTop = '28px';
      sec.innerHTML = `
        <div class="page-header">
          <h2>🚩 System Issue Reports &amp; Support Tickets</h2>
          <p>Review bug reports, complaints, and support tickets submitted by users and venue owners (Admin only)</p>
        </div>
        <div class="users-toolbar" style="justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <select id="issueRoleFilter" class="users-filter" onchange="renderIssueReportsTable()">
              <option value="all">All Reporter Roles</option>
              <option value="user">User (Customer)</option>
              <option value="owner">Owner (Facility Owner)</option>
              <option value="staff">Staff (Front Desk)</option>
            </select>
            <select id="issueStatusFilter" class="users-filter" onchange="renderIssueReportsTable()">
              <option value="all">All Ticket Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <button type="button" class="btn" onclick="loadIssueReports()" style="border:1px solid var(--border); background:#fff; padding:6px 14px; border-radius:8px;">🔄 Refresh</button>
          </div>
          <div id="issueSummaryPills" style="display:flex; gap:8px; flex-wrap:wrap; font-size:0.78rem; font-weight:700;"></div>
        </div>
        <div class="users-card" style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Reporter</th><th>Role</th><th>Category</th><th>Description</th><th>Screenshot</th><th>Date Reported</th><th>Ticket Status</th></tr></thead>
            <tbody id="issueReportsBody"></tbody>
          </table>
        </div>`;
      platView.appendChild(sec);
    }

    if (!document.getElementById('platformAuditSection')) {
      const auditSec = document.createElement('div');
      auditSec.id = 'platformAuditSection';
      auditSec.style.marginTop = '28px';
      auditSec.innerHTML = `
        <div class="page-header">
          <h2>🛡️ Platform Configuration &amp; Read-Only Audit Logs</h2>
          <p>System environment parameters and read-only platform-wide booking/payment transaction logs (No venue operational overrides)</p>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:20px;">
          <div style="background:var(--surface); border:1px solid var(--border-light); border-radius:12px; padding:14px 16px;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:700; text-transform:uppercase;">Database &amp; Auth Engine</div>
            <div style="font-size:0.95rem; font-weight:800; color:#15803d; margin-top:4px;">● Supabase PostgreSQL (Connected)</div>
            <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">Row-Level Security &amp; JWT Auth Active</div>
          </div>
          <div style="background:var(--surface); border:1px solid var(--border-light); border-radius:12px; padding:14px 16px;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:700; text-transform:uppercase;">AI Slip Verification</div>
            <div style="font-size:0.95rem; font-weight:800; color:#1d4ed8; margin-top:4px;">Google Gemini (gemini-3.5-flash-lite)</div>
            <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">Endpoint: /api/verify-slip · Max 5MB</div>
          </div>
          <div style="background:var(--surface); border:1px solid var(--border-light); border-radius:12px; padding:14px 16px;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:700; text-transform:uppercase;">RBAC Security Policy</div>
            <div style="font-size:0.95rem; font-weight:800; color:#7e22ce; margin-top:4px;">Strict Role Isolation</div>
            <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">Admin governance separated from Venue Ops</div>
          </div>
          <div style="background:var(--surface); border:1px solid var(--border-light); border-radius:12px; padding:14px 16px;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:700; text-transform:uppercase;">Platform Operating Hours</div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--text); margin-top:4px;">06:00 – 22:00 Daily</div>
            <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">77 Provinces · 5 Sport Categories</div>
          </div>
        </div>
        <div class="users-toolbar" style="justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div class="users-search-wrap" style="flex:1; min-width:220px;">
            <i data-lucide="search"></i>
            <input type="text" id="auditSearchInput" class="users-search" placeholder="Search audit log by customer, bill ID, or facility..." oninput="renderPlatformAuditLogs()">
          </div>
          <select id="auditStatusFilter" class="users-filter" onchange="renderPlatformAuditLogs()">
            <option value="all">All Booking Statuses</option>
            <option value="pending">Pending Verification</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed (Checked In)</option>
            <option value="rejected">Cancelled / Rejected</option>
          </select>
        </div>
        <div class="users-card" style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Bill Ref</th>
                <th>Customer</th>
                <th>Facility &amp; Schedule</th>
                <th>Amount</th>
                <th>Slip Proof</th>
                <th>Status</th>
                <th>Audit Inspection</th>
              </tr>
            </thead>
            <tbody id="platformAuditTableBody"></tbody>
          </table>
        </div>`;
      platView.appendChild(auditSec);
    }

    switchPlatformSubTab(currentPlatformSubTab);
  } else {
    // Restore Manage Facilities view to its original container for Facility Owners
    if (facView && mainContent && facView.parentElement !== mainContent) {
      facView.style.marginTop = '';
      facView.style.display = '';
      mainContent.appendChild(facView);
    }
  }
}

function switchPlatformSubTab(tab) {
  currentPlatformSubTab = tab || 'all';
  const ownersSec = document.getElementById('platformOwnersSection');
  const usersView = document.getElementById('view-users');
  const facView = document.getElementById('view-manage-facilities');
  const issuesSec = document.getElementById('platformIssuesSection');
  const auditSec = document.getElementById('platformAuditSection');

  document.querySelectorAll('#platformSubTabs .plat-tab-btn').forEach(btn => {
    const active = btn.dataset.ptab === currentPlatformSubTab;
    btn.style.background = active ? 'var(--primary)' : '#fff';
    btn.style.color = active ? '#fff' : 'var(--text)';
    btn.style.border = active ? 'none' : '1px solid var(--border)';
  });

  document.querySelectorAll('#navAdminLinks a[data-admin-tab]').forEach(a => {
    a.classList.toggle('active', a.dataset.adminTab === currentPlatformSubTab);
  });

  const showOwnersAndFacs = (currentPlatformSubTab === 'all' || currentPlatformSubTab === 'owners' || currentPlatformSubTab === 'facilities');
  if (ownersSec) ownersSec.style.display = (currentPlatformSubTab === 'all' || currentPlatformSubTab === 'owners') ? 'block' : 'none';
  if (facView && currentRole === 'admin') facView.style.display = showOwnersAndFacs ? 'block' : 'none';
  if (usersView) usersView.style.display = (currentPlatformSubTab === 'all' || currentPlatformSubTab === 'users') ? 'block' : 'none';
  if (issuesSec) issuesSec.style.display = (currentPlatformSubTab === 'all' || currentPlatformSubTab === 'issues') ? 'block' : 'none';
  if (auditSec) auditSec.style.display = (currentPlatformSubTab === 'all' || currentPlatformSubTab === 'audit') ? 'block' : 'none';
}

async function renderPlatformOverview() {
  if (currentRole !== 'admin') return;
  setupPlatformCombinedLayout();

  const kpiBox = document.getElementById('platformKpis'), tblBody = document.getElementById('platformOwnerTable');
  if (!kpiBox || !tblBody) return;
  kpiBox.innerHTML = '<div style="color:var(--text-tertiary); padding:12px;">Loading platform data...</div>';

  const [pRes, fRes, bRes] = await Promise.all([
    supabaseClient.from('profiles').select('*'),
    supabaseClient.from('facilities').select('*'),
    supabaseClient.from('bookings').select('*').order('created_at', { ascending: false }).limit(5000)
  ]);

  if (pRes.error || fRes.error || bRes.error) {
    const msg = (pRes.error || fRes.error || bRes.error).message;
    kpiBox.innerHTML = `<div style="color:#dc2626; padding:12px;">Failed to load data: ${escPlat(msg)}</div>`;
    return;
  }

  const profiles = pRes.data || [], facs = fRes.data || [], bookings = bRes.data || [];
  FACILITIES = facs;
  usersCache = profiles;
  platformAuditBookingsCache = bookings;
  ownerProfilesCache = profiles.filter(p => p.role === 'owner' || p.role === 'admin');

  const okStatus = s => ['approved', 'completed'].includes(String(s || '').toLowerCase());
  const facOwner = {};
  facs.forEach(f => { facOwner[String(f.id)] = f.owner_id ? String(f.owner_id) : ''; });

  const perOwner = {};
  ownerProfilesCache.forEach(p => {
    perOwner[String(p.id)] = { name: p.name || p.id, role: p.role, facilities: 0, bookings: 0, revenue: 0 };
  });
  perOwner[''] = { name: '— Unassigned —', role: '', facilities: 0, bookings: 0, revenue: 0 };

  facs.forEach(f => {
    const k = f.owner_id && perOwner[String(f.owner_id)] ? String(f.owner_id) : '';
    perOwner[k].facilities++;
  });

  let totalRevenue = 0, pendingRevenue = 0, confirmedBookings = 0, pendingBookings = 0, cancelledBookings = 0;
  bookings.forEach(b => {
    const st = String(b.payment_status || '').toLowerCase();
    const p = Number(b.total_price || 0);
    if (st === 'rejected') {
      cancelledBookings++;
      return;
    }
    const oid = facOwner[String(b.facility_id)] || '';
    const k = perOwner[oid] ? oid : '';
    perOwner[k].bookings++;
    if (okStatus(st)) {
      confirmedBookings++;
      perOwner[k].revenue += p;
      totalRevenue += p;
    } else if (st === 'pending') {
      pendingBookings++;
      pendingRevenue += p;
    }
  });

  const count = r => profiles.filter(p => normalizeRole(p.role) === r).length;
  const activeFacs = facs.filter(f => String(f.status || 'available').toLowerCase() === 'available').length;
  const maintFacs = facs.length - activeFacs;
  const unassigned = facs.filter(f => !f.owner_id).length;
  const kpi = (label, val, sub) => `<div class="plat-kpi"><div class="plat-kpi-label">${label}</div><div class="plat-kpi-val">${val}</div><div class="plat-kpi-sub">${sub || ''}</div></div>`;

  kpiBox.innerHTML =
    kpi('Total Platform Users', profiles.length.toLocaleString(), `Users: ${count('user')} · Owners: ${count('owner')} · Staff: ${count('staff')} · Admins: ${count('admin')}`) +
    kpi('Total Platform-Wide Revenue', '฿' + totalRevenue.toLocaleString(), `Verified across all venues (Pending: ฿${pendingRevenue.toLocaleString()})`) +
    kpi('Total System Bookings', (confirmedBookings + pendingBookings).toLocaleString(), `Confirmed: ${confirmedBookings.toLocaleString()} · Pending: ${pendingBookings.toLocaleString()} · Cancelled: ${cancelledBookings.toLocaleString()}`) +
    kpi('Active Facilities', `${activeFacs.toLocaleString()} / ${facs.length.toLocaleString()}`, unassigned ? `⚠️ ${unassigned} Unassigned · ${maintFacs} Maintenance` : `${maintFacs} Maintenance · All assigned`);

  const rows = Object.values(perOwner).filter(o => o.facilities > 0 || o.bookings > 0 || o.role === 'owner').sort((x, y) => y.revenue - x.revenue);
  tblBody.innerHTML = rows.length ? rows.map(o => `<tr>
      <td><strong>${escPlat(o.name)}</strong>${o.role ? `<div style="font-size:0.72rem; color:var(--text-tertiary);">${escPlat(o.role)}</div>` : ''}</td>
      <td>${o.facilities}</td><td>${o.bookings}</td><td>฿${o.revenue.toLocaleString()}</td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-tertiary);">No data available</td></tr>';

  renderUsersTable();
  renderFacilitiesTable();
  loadIssueReports();
  renderPlatformAuditLogs();
  if (window.lucide) lucide.createIcons();
}

function renderPlatformAuditLogs() {
  const tbody = document.getElementById('platformAuditTableBody');
  if (!tbody) return;
  const q = (document.getElementById('auditSearchInput')?.value || '').trim().toLowerCase();
  const statusF = (document.getElementById('auditStatusFilter')?.value || 'all').toLowerCase();
  const allBills = groupBookingsIntoBills(platformAuditBookingsCache || []);

  const filtered = allBills.filter(b => {
    const st = String(b.payment_status || 'pending').toLowerCase();
    if (statusF !== 'all' && st !== statusF) return false;
    if (!q) return true;
    const fac = FACILITIES.find(f => String(f.id) === String(b.facility_id));
    return [b.groupId, b.customer_name, b.customer_phone, fac?.name, b.date].some(v => String(v || '').toLowerCase().includes(q));
  }).slice(0, 100);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-tertiary);">No booking audit records match the selected criteria</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(bill => {
    const fac = FACILITIES.find(f => String(f.id) === String(bill.facility_id)) || { name: 'Sports Facility' };
    const st = String(bill.payment_status || 'pending').toLowerCase();
    const slotText = bill.slots.map(s => `${s.start}-${s.end}`).join(', ');
    let badgeHtml = '';
    if (st === 'completed') badgeHtml = '<span style="background:#dbeafe; color:#1d4ed8; padding:3px 10px; border-radius:999px; font-size:0.74rem; font-weight:700;">COMPLETED</span>';
    else if (st === 'approved') badgeHtml = '<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:999px; font-size:0.74rem; font-weight:700;">APPROVED</span>';
    else if (st === 'pending') badgeHtml = '<span style="background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:999px; font-size:0.74rem; font-weight:700;">PENDING</span>';
    else badgeHtml = '<span style="background:#fee2e2; color:#dc2626; padding:3px 10px; border-radius:999px; font-size:0.74rem; font-weight:700;">REJECTED</span>';

    const slipCell = (bill.slip_url && bill.slip_url !== 'walk-in' && !String(bill.slip_url).startsWith('walkin_'))
      ? `<button type="button" onclick="previewSlipModal('${escPlat(String(bill.slip_url).trim())}')" style="background:none; border:none; color:var(--primary); text-decoration:underline; font-weight:600; cursor:pointer; font-size:0.82rem;">🖼️ View Slip</button>`
      : '<span style="color:var(--text-tertiary); font-size:0.76rem;">Walk-in / Direct</span>';

    return `<tr>
      <td><strong>#${escPlat(String(bill.groupId).slice(0, 8))}</strong><div style="font-size:0.72rem; color:var(--text-tertiary);">${bill.slots.length} slot(s)</div></td>
      <td><strong>${escPlat(bill.customer_name)}</strong><div style="font-size:0.76rem; color:var(--text-secondary);">📞 ${escPlat(bill.customer_phone)}</div></td>
      <td><strong>${escPlat(fac.name)}</strong><div style="font-size:0.76rem; color:var(--text-secondary);">📅 ${escPlat(bill.date)} (${escPlat(slotText)})</div></td>
      <td><strong style="color:var(--primary);">฿${Number(bill.total_price || 0).toLocaleString()}</strong></td>
      <td>${slipCell}</td>
      <td>${badgeHtml}</td>
      <td><button type="button" class="btn" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:4px 10px; font-size:0.75rem; border-radius:6px;" onclick="openBookingTicketModal('${escPlat(bill.groupId)}', false)">🔍 Inspect Record (Read-Only)</button></td>
    </tr>`;
  }).join('');
}

// ============ ADMIN: Issue Reports from Users / Facility Owners ============
let issueReportsCache = [];
const ISSUE_STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' };
const ISSUE_ROLE_LABELS = { user: 'User (Customer)', owner: 'Owner (Facility Owner)', admin: 'Admin', staff: 'Staff' };

async function loadIssueReports() {
  if (currentRole !== 'admin') return;
  const body = document.getElementById('issueReportsBody');
  if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-tertiary);">Loading...</td></tr>';
  const { data, error } = await supabaseClient.from('issue_reports').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) {
    if (body) body.innerHTML = `<tr><td colspan="7" style="color:#dc2626; padding:16px;">Failed to load: ${escPlat(error.message)}</td></tr>`;
    return;
  }
  const ids = [...new Set((data || []).map(r => r.user_id).filter(Boolean))];
  let profMap = {};
  if (ids.length) {
    const { data: profs } = await supabaseClient.from('profiles').select('*').in('id', ids);
    (profs || []).forEach(p => { profMap[String(p.id)] = p; });
  }
  issueReportsCache = (data || []).map(r => ({ ...r, reporter: profMap[String(r.user_id)] || null }));
  renderIssueReportsTable();
  updateIssueTabBadge();
}

function updateIssueTabBadge() {
  const pendingCount = issueReportsCache.filter(r => (r.status || 'pending') === 'pending').length;
  const inProgCount = issueReportsCache.filter(r => r.status === 'in_progress').length;
  const resolvedCount = issueReportsCache.filter(r => r.status === 'resolved').length;
  const el = document.getElementById('issueTabBadge');
  if (el) { el.textContent = pendingCount > 99 ? '99+' : pendingCount; el.style.display = pendingCount > 0 ? 'inline-block' : 'none'; }
  const pillsEl = document.getElementById('issueSummaryPills');
  if (pillsEl) {
    pillsEl.innerHTML = `
      <span style="background:#fef9c3; color:#a16207; padding:4px 10px; border-radius:999px; border:1px solid #fde047;">⏳ Pending: ${pendingCount}</span>
      <span style="background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:999px; border:1px solid #bfdbfe;">🔧 In Progress: ${inProgCount}</span>
      <span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:999px; border:1px solid #86efac;">✓ Resolved: ${resolvedCount}</span>
    `;
  }
}

function renderIssueReportsTable() {
  const body = document.getElementById('issueReportsBody');
  if (!body) return;
  const roleF = document.getElementById('issueRoleFilter')?.value || 'all';
  const statF = document.getElementById('issueStatusFilter')?.value || 'all';
  const rows = issueReportsCache.filter(r => {
    const role = r.reporter?.role || 'unknown';
    const st = r.status || 'pending';
    return (roleF === 'all' || role === roleF) && (statF === 'all' || st === statF);
  });
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-tertiary);">No issue reports found</td></tr>';
    return;
  }
  const roleColor = { owner: ['#fef3c7', '#b45309'], user: ['#dbeafe', '#1d4ed8'], admin: ['#f3e8ff', '#7e22ce'], staff: ['#dcfce7', '#15803d'] };
  body.innerHTML = rows.map(r => {
    const p = r.reporter;
    const role = p?.role || 'unknown';
    const [bg, fg] = roleColor[role] || ['#f1f5f9', '#475569'];
    const st = r.status || 'pending';
    const when = r.created_at ? new Date(r.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    const img = r.image_url ? `<a href="${escPlat(r.image_url)}" target="_blank" rel="noopener"><img src="${escPlat(r.image_url)}" alt="Attachment" style="width:48px; height:48px; object-fit:cover; border-radius:8px; border:1px solid var(--border);"></a>` : '<span style="color:var(--text-tertiary);">-</span>';
    const opts = Object.entries(ISSUE_STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === st ? 'selected' : ''}>${l}</option>`).join('');
    return `<tr>
      <td><strong>${escPlat(p?.name || 'Unknown User')}</strong>${p?.phone ? `<div style="font-size:0.72rem; color:var(--text-tertiary);">${escPlat(p.phone)}</div>` : ''}</td>
      <td><span style="background:${bg}; color:${fg}; padding:3px 10px; border-radius:999px; font-size:0.75rem; font-weight:700;">${escPlat(ISSUE_ROLE_LABELS[role] || role)}</span></td>
      <td>${escPlat(REPORT_CATEGORY_LABELS[r.category] || r.category || '-')}</td>
      <td style="max-width:320px; white-space:pre-wrap; word-break:break-word;">${escPlat(r.description || '')}</td>
      <td>${img}</td>
      <td style="white-space:nowrap; font-size:0.8rem;">${when}</td>
      <td><select onchange="updateIssueStatus('${r.id}', this.value)" style="padding:4px 8px; border:1px solid var(--border); border-radius:6px; font-size:0.8rem;">${opts}</select></td>
    </tr>`;
  }).join('');
}

async function updateIssueStatus(id, status) {
  if (currentRole !== 'admin') { alert('Only System Administrators can update issue status.'); return; }
  const { error } = await supabaseClient.from('issue_reports').update({ status }).eq('id', id);
  if (error) { alert('Failed to update status: ' + error.message); await loadIssueReports(); return; }
  const row = issueReportsCache.find(r => String(r.id) === String(id));
  if (row) row.status = status;
  updateIssueTabBadge();
  renderIssueReportsTable();
  refreshNotifications(false);
}

async function openIssueReportsTab() {
  await openAdminModule('issues');
}

// ============ ADMIN: Users & Roles Management (With Self-Demotion Protection) ============
let usersCache = [];
async function renderUsersView() {
  if (currentRole !== 'admin') return;
  const body = document.getElementById('usersTableBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-tertiary);">Loading...</td></tr>';
  const { data, error } = await supabaseClient.from('profiles').select('*');
  if (error) { body.innerHTML = `<tr><td colspan="4" style="color:#dc2626; padding:16px;">Failed to load: ${escPlat(error.message)}</td></tr>`; return; }
  usersCache = data || [];
  renderUsersTable();
}
function renderUsersTable() {
  const body = document.getElementById('usersTableBody');
  if (!body) return;
  const q = (document.getElementById('usersSearchInput')?.value || '').trim().toLowerCase();
  const roleF = document.getElementById('usersRoleFilter')?.value || 'all';
  const list = usersCache.filter(u => (roleF === 'all' || normalizeRole(u.role) === roleF) &&
    (!q || [u.name, u.phone, u.email, u.id].some(x => String(x || '').toLowerCase().includes(q))));
  if (!list.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--text-tertiary);">No users found</td></tr>'; return; }
  const roles = [
    ['user', 'User (Customer)'],
    ['owner', 'Owner (Facility Owner)'],
    ['staff', 'Staff (Front Desk)'],
    ['admin', 'Admin (System Admin)']
  ];
  body.innerHTML = list.map(u => {
    const isMe = String(u.id) === String(currentUser?.id);
    const role = normalizeRole(u.role);
    const initial = escPlat(String(u.name || '?').trim().charAt(0).toUpperCase() || '?');
    const displayEmail = u.email || (isMe ? currentUser?.email : '') || '-';
    return `<tr>
      <td><div class="users-cell"><span class="users-avatar users-avatar-${role}">${initial}</span>
        <div><strong>${escPlat(u.name || '-')}</strong>${isMe ? ' <span class="status-badge approved" title="Self-protection active: You cannot demote your own Admin account">🔒 You (Protected)</span>' : ''}</div></div></td>
      <td style="font-size:0.84rem; color:var(--text-secondary);">${escPlat(displayEmail)}</td>
      <td>${escPlat(u.phone || '-')}</td>
      <td><select class="role-select role-select-${role}" ${isMe ? 'disabled title="Self-protection: Administrators cannot demote or modify their own role"' : ''} onchange="changeUserRole('${escPlat(u.id)}', this.value)">
        ${roles.map(([v, l]) => `<option value="${v}" ${role === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}
async function changeUserRole(userId, newRole) {
  if (currentRole !== 'admin') { alert('Access denied: System Administrators only.'); return; }
  if (String(userId) === String(currentUser?.id)) {
    alert('Security Policy: You cannot demote or change your own Administrator role.');
    renderUsersTable();
    return;
  }
  const allowedRoles = ['user', 'owner', 'staff', 'admin'];
  if (!allowedRoles.includes(newRole)) { alert('Invalid role selected.'); renderUsersTable(); return; }
  const u = usersCache.find(x => String(x.id) === String(userId));
  if (!confirm(`Confirm role update for "${u?.name || userId}" to "${newRole.toUpperCase()}"?`)) { renderUsersTable(); return; }
  const { error } = await supabaseClient.from('profiles').update({ role: newRole }).eq('id', userId);
  if (error) { alert('Failed to update role: ' + error.message); await renderUsersView(); return; }
  if (u) u.role = newRole;
  renderUsersTable();
}

function openAddFacilityModal() {
  populateProvinceDropdowns();
  ['addFieldName', 'addFieldPrice', 'addFieldProvince', 'addFieldMapUrl', 'addFieldBankName', 'addFieldBankAccount', 'addFieldAccountName', 'newFacilityDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const sportEl = document.getElementById('addFieldSport'); if (sportEl) sportEl.selectedIndex = 0;
  const statusEl = document.getElementById('addFieldStatus'); if (statusEl) statusEl.value = 'available';
  document.querySelectorAll('input[name="facilityAmenity"]').forEach(cb => cb.checked = false);
  selectedFacilityImages = []; renderFacilityImagePreview();
  const modalBox = document.querySelector('#addFacilityModal .modal'); if (modalBox) modalBox.scrollTop = 0;
  document.getElementById('addFacilityModal').classList.add('active');
}

async function submitNewFacility() {
  const nameInput = document.getElementById('addFieldName');
  const sportInput = document.getElementById('addFieldSport');
  const priceInput = document.getElementById('addFieldPrice');
  const statusInput = document.getElementById('addFieldStatus');
  const provinceInput = document.getElementById('addFieldProvince');
  const mapUrlInput = document.getElementById('addFieldMapUrl');
  const name = nameInput.value.trim();
  const sport = sportInput.value;
  const price = parseInt(priceInput.value);
  const status = statusInput.value;
  const province = provinceInput ? provinceInput.value.trim() : '';
  const mapUrl = mapUrlInput ? mapUrlInput.value.trim() : '';
  const bankName = document.getElementById('addFieldBankName').value;
  const bankAccount = document.getElementById('addFieldBankAccount').value;
  const accountName = document.getElementById('addFieldAccountName').value;
  const description = document.getElementById('newFacilityDesc').value;
  const selectedAmenities = Array.from(document.querySelectorAll('input[name="facilityAmenity"]:checked')).map(cb => cb.value);

  if (!name || !price) { alert('Please enter both the facility name and hourly price.'); return; }
  if (!province) { alert('Please select the province where the facility is located.'); return; }
  const btn = document.querySelector('#addFacilityModal .btn-primary');
  const originalBtnText = btn ? btn.textContent : 'Add Facility';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const newId = 'F' + Math.floor(100 + Math.random() * 900);
    const uploadedImageUrls = [];
    if (selectedFacilityImages.length > 0) {
      for (let i = 0; i < selectedFacilityImages.length; i++) {
        const file = selectedFacilityImages[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${newId}_${Date.now()}_${i}.${fileExt}`;
        const filePath = `facilities/${fileName}`;
        const { error: uploadErr } = await supabaseClient.storage.from('facility-images').upload(filePath, file);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabaseClient.storage.from('facility-images').getPublicUrl(filePath);
        uploadedImageUrls.push(urlData.publicUrl);
      }
    }
    const randomColor = `oklch(${Math.floor(45 + Math.random() * 15)}% 0.12 ${Math.floor(Math.random() * 360)})`;
    const { error: insertErr } = await supabaseClient.from('facilities').insert([{
      id: newId, owner_id: currentUser?.id || null, name: name, sport: sport, price: price, status: status,
      province: province, map_url: mapUrl, color: randomColor, images: uploadedImageUrls, description: description,
      amenities: selectedAmenities, bank_name: bankName, bank_account: bankAccount, account_name: accountName,
    }]);
    if (insertErr) throw insertErr;
    alert('Sports facility added successfully!');
    nameInput.value = ''; priceInput.value = '';
    if (provinceInput) provinceInput.value = ''; if (mapUrlInput) mapUrlInput.value = '';
    selectedFacilityImages = []; renderFacilityImagePreview(); closeModal('addFacilityModal');
    await fetchFacilities('all');
  } catch (err) { alert('Error: ' + err.message); } finally { if (btn) { btn.disabled = false; btn.textContent = originalBtnText; } }
}

let editingFacilityImages = [];
function renderEditImagePreview() {
  const container = document.getElementById('editFacilityImagePreviewList');
  const uploadBox = document.getElementById('editFacilityImageUploadBox');
  if (!container) return; container.innerHTML = '';
  if (uploadBox) uploadBox.style.display = editingFacilityImages.length >= 4 ? 'none' : 'block';
  editingFacilityImages.forEach((imgItem, idx) => {
    const isFile = imgItem instanceof File; const src = isFile ? URL.createObjectURL(imgItem) : imgItem;
    const div = document.createElement('div');
    div.style.cssText = 'position: relative; width: 68px; height: 68px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;';
    div.innerHTML = `<img src="${src}" style="width: 100%; height: 100%; object-fit: cover;"><button type="button" onclick="removeEditImage(${idx})" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; line-height: 1;">✕</button>`;
    container.appendChild(div);
  });
}
function removeEditImage(index) { editingFacilityImages.splice(index, 1); renderEditImagePreview(); }
function handleEditFacilityImages(event) {
  const files = Array.from(event.target.files);
  for (const f of files) { if (editingFacilityImages.length >= 4) break; editingFacilityImages.push(f); }
  renderEditImagePreview(); event.target.value = '';
}

function openEditFacilityModal(facilityId) {
  if (!isMyManagedFacility(FACILITIES.find(f => String(f.id) === String(facilityId)))) { alert('You do not have permission to manage this facility'); return; }
  populateProvinceDropdowns();
  const facility = FACILITIES.find(f => f.id === facilityId);
  if (!facility) return;
  document.getElementById('editFacilityId').value = facility.id;
  document.getElementById('editFieldName').value = facility.name;
  document.getElementById('editFieldSport').value = facility.sport;
  document.getElementById('editFieldPrice').value = facility.price;
  document.getElementById('editFieldStatus').value = facility.status;
  if (document.getElementById('editFieldProvince')) document.getElementById('editFieldProvince').value = facility.province || '';
  if (document.getElementById('editFieldMapUrl')) document.getElementById('editFieldMapUrl').value = facility.map_url || '';
  document.getElementById('editFieldBankName').value = facility.bank_name || '';
  document.getElementById('editFieldBankAccount').value = facility.bank_account || '';
  document.getElementById('editFieldAccountName').value = facility.account_name || '';
  if (document.getElementById('editFieldDesc')) document.getElementById('editFieldDesc').value = facility.description || '';
  let currentAmenities = [];
  if (facility.amenities) {
    if (Array.isArray(facility.amenities)) currentAmenities = facility.amenities;
    else if (typeof facility.amenities === 'string') { try { currentAmenities = JSON.parse(facility.amenities); } catch (e) { currentAmenities = facility.amenities.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"|"$/g, '').trim()); } }
  }
  const currentAmenitiesTranslated = currentAmenities.map(a => translateAmenity(a));
  document.querySelectorAll('input[name="editFacilityAmenity"]').forEach(cb => {
    cb.checked = currentAmenities.includes(cb.value) || currentAmenitiesTranslated.includes(translateAmenity(cb.value));
  });
  editingFacilityImages = [];
  if (facility.images) {
    if (Array.isArray(facility.images)) editingFacilityImages = [...facility.images];
    else if (typeof facility.images === 'string') { try { editingFacilityImages = JSON.parse(facility.images); } catch (e) { editingFacilityImages = facility.images.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean); } }
  }
  renderEditImagePreview();
  document.getElementById('editFacilityModal').classList.add('active');
}

async function submitEditFacility() {
  const id = document.getElementById('editFacilityId').value;
  if (!isMyManagedFacility(FACILITIES.find(f => String(f.id) === String(id)))) { alert('You do not have permission to manage this facility'); return; }

  const name = document.getElementById('editFieldName').value.trim();
  const sport = document.getElementById('editFieldSport').value;
  const price = parseInt(document.getElementById('editFieldPrice').value);
  const status = document.getElementById('editFieldStatus').value;
  const province = document.getElementById('editFieldProvince') ? document.getElementById('editFieldProvince').value.trim() : '';
  const mapUrl = document.getElementById('editFieldMapUrl') ? document.getElementById('editFieldMapUrl').value.trim() : '';
  const description = document.getElementById('editFieldDesc') ? document.getElementById('editFieldDesc').value : '';
  const selectedAmenities = Array.from(document.querySelectorAll('input[name="editFacilityAmenity"]:checked')).map(cb => cb.value);
  const bankName = document.getElementById('editFieldBankName').value;
  const bankAccount = document.getElementById('editFieldBankAccount').value;
  const accountName = document.getElementById('editFieldAccountName').value;

  if (!name || !price) { alert('Please fill in all required fields'); return; }
  let finalImageUrls = [];
  for (let item of editingFacilityImages) {
    if (item instanceof File) {
      const fileExt = item.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadErr } = await supabaseClient.storage.from('facility-images').upload(fileName, item);
      if (!uploadErr) {
        const { data: urlData } = supabaseClient.storage.from('facility-images').getPublicUrl(fileName);
        finalImageUrls.push(urlData.publicUrl);
      }
    } else if (typeof item === 'string') { finalImageUrls.push(item); }
  }
  const { error } = await supabaseClient.from('facilities').update({
    name: name, sport: sport, price: price, status: status, province: province, map_url: mapUrl, description: description,
    amenities: selectedAmenities, images: finalImageUrls, bank_name: bankName, bank_account: bankAccount, account_name: accountName,
  }).eq('id', id);

  if (error) { alert('Failed to update facility: ' + error.message); } else {
    alert('Facility updated successfully!');
    closeModal('editFacilityModal'); await fetchFacilities('all');
  }
}

async function deleteFacility(facilityId) {
  if (!isMyManagedFacility(FACILITIES.find(f => String(f.id) === String(facilityId)))) { alert('You do not have permission to manage this facility'); return; }
  if (!confirm(`Are you sure you want to delete this sports facility (ID: ${facilityId})?`)) return;
  const { error } = await supabaseClient.from('facilities').delete().eq('id', facilityId);
  if (error) alert('Failed to delete facility: ' + error.message); else { alert('Facility deleted successfully!'); await fetchFacilities('all'); }
}

let isEditingEquipment = false; let editingEquipmentId = null;
let currentManageFacilityId = null;

function ensureEquipmentModalExists() {
  let modal = document.getElementById('manageEquipmentModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'manageEquipmentModal';
    modal.innerHTML = `
      <div class="modal" style="max-width: 560px; width: 100%;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <h3 style="margin:0;">📦 Manage Equipment & Add-ons</h3>
          <button type="button" onclick="closeModal('manageEquipmentModal')" style="background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--text-secondary);">✕</button>
        </div>
        <p id="eqFacilityName" style="font-size: 0.88rem; color: var(--primary); margin-bottom: 16px; font-weight: 700;"></p>
        <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:20px;">
          <h4 id="eqFormTitle" style="margin:0 0 12px 0; font-size:0.95rem;">+ Add New Equipment</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div class="form-group" style="grid-column: 1 / -1; margin:0;"><label>Equipment / Item Name <span style="color:red">*</span></label><input type="text" id="eqName" placeholder="e.g., Basketball, Training Bibs"></div>
            <div class="form-group" style="margin:0;"><label>Type <span style="color:red">*</span></label><select id="eqType"><option value="ซื้อ">Buy (Purchase)</option><option value="เช่า">Rent (Per Session)</option></select></div>
            <div class="form-group" style="margin:0;"><label>Price (฿) <span style="color:red">*</span></label><input type="number" id="eqPrice" placeholder="e.g., 50"></div>
            <div class="form-group" style="grid-column: 1 / -1; margin:0;"><label>Total Stock (Units) <span style="color:red">*</span></label><input type="number" id="eqStock" placeholder="e.g., 10"></div>
          </div>
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button type="button" id="eqSubmitBtn" class="btn btn-success" style="flex:1;" onclick="submitNewEquipment()">+ Save to Catalog</button>
            <button type="button" id="eqCancelEditBtn" class="btn btn-secondary" style="display:none;" onclick="resetEquipmentForm()">Cancel Edit</button>
          </div>
        </div>
        <h4 style="margin:0 0 8px 0; font-size:0.95rem;">Current Equipment List</h4>
        <div id="equipmentList" style="max-height: 240px; overflow-y: auto; border:1px solid #e2e8f0; border-radius:10px; padding:8px; background: #fff;"></div>
        <div class="flex mt-16"><button type="button" class="btn btn-secondary btn-block" onclick="closeModal('manageEquipmentModal')">Close</button></div>
      </div>`;
    document.body.appendChild(modal);
  }
}

function resetEquipmentForm() {
  isEditingEquipment = false; editingEquipmentId = null;
  ['eqName', 'eqPrice', 'eqStock'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  if (document.getElementById('eqType')) document.getElementById('eqType').value = 'ซื้อ';
  const btn = document.getElementById('eqSubmitBtn'); if (btn) { btn.textContent = '+ Save to Catalog'; btn.style.background = '#16a34a'; }
  const cancelBtn = document.getElementById('eqCancelEditBtn'); if (cancelBtn) cancelBtn.style.display = 'none';
}

async function openEquipmentModal(facilityId) {
  if (!isMyManagedFacility(FACILITIES.find(f => String(f.id) === String(facilityId)))) { alert('You do not have permission to manage this facility'); return; }
  ensureEquipmentModalExists(); currentManageFacilityId = facilityId;
  const facility = FACILITIES.find(f => String(f.id) === String(facilityId));
  if (document.getElementById('eqFacilityName')) document.getElementById('eqFacilityName').textContent = `Facility: ${facility?.name || facilityId}`;
  resetEquipmentForm(); document.getElementById('manageEquipmentModal').classList.add('active');
  await loadEquipmentList();
}

async function loadEquipmentList() {
  ensureEquipmentModalExists();
  const listEl = document.getElementById('equipmentList'); if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-secondary);">Loading...</div>';
  const { data, error } = await supabaseClient.from('equipment').select('*').eq('facility_id', currentManageFacilityId).order('created_at', { ascending: false });
  if (error || !data || data.length === 0) {
    window.currentFacilityEquipmentData = [];
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-tertiary);">No equipment or add-on items for this facility yet</div>';
    return;
  }
  window.currentFacilityEquipmentData = data;
  listEl.innerHTML = data.map(eq => {
    const isRent = isRentEquipment(eq.type);
    const typeLabel = translateEqType(eq.type);
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #f1f5f9; gap:8px; flex-wrap:wrap;">
      <div><strong style="font-size:0.9rem;">${eq.name}</strong><span style="font-size:0.72rem; background:${isRent ? '#eff6ff' : '#fef3c7'}; color:${isRent ? '#1d4ed8' : '#d97706'}; padding:2px 8px; border-radius:10px; margin-left:6px; font-weight:700;">${typeLabel}</span><div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">Price: <strong>฿${Number(eq.price || 0).toLocaleString()}</strong> | Total Stock: <strong>${eq.stock}</strong> units</div></div>
      <div style="display:flex; gap:6px;"><button type="button" class="btn" style="background:#e2e8f0; color:#1e293b; border:none; padding:5px 12px; font-size:0.75rem; border-radius:6px;" onclick="editEquipment('${eq.id}')">Edit</button><button type="button" class="btn" style="background:#fee2e2; color:#ef4444; border:none; padding:5px 12px; font-size:0.75rem; border-radius:6px;" onclick="deleteEquipment('${eq.id}')">Delete</button></div>
    </div>`;
  }).join('');
}

function editEquipment(eqId) {
  const eq = (window.currentFacilityEquipmentData || []).find(e => String(e.id) === String(eqId));
  if (!eq) return;
  isEditingEquipment = true; editingEquipmentId = eq.id;
  ['eqName', 'eqType', 'eqPrice', 'eqStock'].forEach(id => { const el = document.getElementById(id); if (el) el.value = eq[id.replace('eq', '').toLowerCase()]; });
  const btn = document.getElementById('eqSubmitBtn'); if (btn) { btn.textContent = '💾 Save Changes'; btn.style.background = '#2563eb'; }
  const cancelBtn = document.getElementById('eqCancelEditBtn'); if (cancelBtn) cancelBtn.style.display = 'inline-flex';
}

async function submitNewEquipment() {
  const name = document.getElementById('eqName')?.value.trim();
  const type = document.getElementById('eqType')?.value || 'ซื้อ';
  const price = parseInt(document.getElementById('eqPrice')?.value);
  const stock = parseInt(document.getElementById('eqStock')?.value);
  if (!name || isNaN(price) || isNaN(stock)) { alert('Please enter the equipment name, price, and stock quantity.'); return; }
  const btn = document.getElementById('eqSubmitBtn'); if (btn) btn.disabled = true;
  try {
    let result;
    if (isEditingEquipment && editingEquipmentId) {
      result = await supabaseClient.from('equipment').update({ name, type, price, stock }).eq('id', editingEquipmentId);
    } else {
      result = await supabaseClient.from('equipment').insert([{ facility_id: currentManageFacilityId, owner_id: currentUser?.id || null, name, type, price, stock }]);
    }
    if (result?.error) throw result.error;
    resetEquipmentForm(); await loadEquipmentList();
  } catch (err) { alert('Failed to save equipment: ' + err.message); } finally { if (btn) btn.disabled = false; }
}

async function deleteEquipment(eqId) {
  if(!confirm('Are you sure you want to delete this equipment item?')) return;
  await supabaseClient.from('equipment').delete().eq('id', eqId);
  await loadEquipmentList();
}

function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }

// ============ NOTIFICATIONS ============
function getReadNotifIds() { try { const raw = localStorage.getItem(`sportcircle_read_notifs_${currentUser?.id || 'guest'}`); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
function setReadNotifIds(ids) { try { localStorage.setItem(`sportcircle_read_notifs_${currentUser?.id || 'guest'}`, JSON.stringify(ids)); } catch (e) {} }

function toggleNotificationDrawer(forceOpen) {
  const drawer = document.getElementById('notifDrawer'), backdrop = document.getElementById('notifBackdrop');
  if (!drawer || !backdrop) return;
  const isOpen = drawer.classList.contains('active'); const shouldOpen = (forceOpen !== undefined) ? forceOpen : !isOpen;
  if (shouldOpen) { drawer.classList.add('active'); backdrop.classList.add('active'); refreshNotifications(false); } 
  else { drawer.classList.remove('active'); backdrop.classList.remove('active'); }
}

function filterNotifTab(tab) {
  currentNotifFilterTab = tab;
  if(document.getElementById('tabNotifAll')) document.getElementById('tabNotifAll').classList.toggle('active', tab === 'all');
  if(document.getElementById('tabNotifUnread')) document.getElementById('tabNotifUnread').classList.toggle('active', tab === 'unread');
  renderNotificationList();
}

function markAllNotificationsAsRead() {
  setReadNotifIds(Array.from(new Set([...getReadNotifIds(), ...currentNotifications.map(n => n.id)])));
  updateNotificationBadges(); renderNotificationList();
}

async function handleNotificationClick(notifId) {
  const notif = currentNotifications.find(n => n.id === notifId);
  const readIds = getReadNotifIds();
  if (!readIds.includes(notifId)) { readIds.push(notifId); setReadNotifIds(readIds); updateNotificationBadges(); }
  toggleNotificationDrawer(false);
  if (notif && typeof notif.action === 'function') await notif.action();
}

function updateNotificationBadges() {
  const readIds = getReadNotifIds();
  const unreadCount = currentNotifications.filter(n => !readIds.includes(n.id)).length;
  const totalCount = currentNotifications.length;
  const badge = document.getElementById('notifBadge'), bellBtn = document.getElementById('notifBellBtn');
  if (badge) { badge.textContent = unreadCount > 99 ? '99+' : unreadCount; badge.style.display = unreadCount > 0 ? 'flex' : 'none'; }
  if (bellBtn) bellBtn.classList.toggle('has-unread', unreadCount > 0);
  ['notifMenuBadgeUser', 'notifMenuBadgeAdmin', 'notifMenuBadgeStaff'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = unreadCount > 99 ? '99+' : unreadCount; el.style.display = unreadCount > 0 ? 'inline-block' : 'none'; } });
  if (document.getElementById('notifUnreadCount')) document.getElementById('notifUnreadCount').textContent = unreadCount;
  if (document.getElementById('notifTotalCount')) document.getElementById('notifTotalCount').textContent = totalCount;
}

function renderNotificationList() {
  const container = document.getElementById('notifListContainer'); if (!container) return;
  const readIds = getReadNotifIds();
  const filtered = (currentNotifFilterTab === 'unread') ? currentNotifications.filter(n => !readIds.includes(n.id)) : currentNotifications;

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:50px 20px; color:var(--text-tertiary);"><div style="font-size:2.4rem; margin-bottom:10px;">${currentNotifFilterTab === 'unread' ? '✨' : '🔔'}</div><div style="font-weight:700; color:#334155; font-size:0.95rem;">${currentNotifFilterTab === 'unread' ? '🎉 All caught up! You have read all notifications' : '📭 No notifications right now'}</div><p style="font-size:0.8rem; margin-top:6px; color:#94a3b8;">You will be notified automatically when there are updates to your facility bookings.</p></div>`;
    return;
  }
  container.innerHTML = filtered.map(n => {
    const isUnread = !readIds.includes(n.id);
    return `<div class="notif-item ${isUnread ? 'unread' : ''}" onclick="handleNotificationClick('${n.id}')"><div class="notif-item-icon" style="background:${n.iconBg || '#eff6ff'}; color:${n.iconColor || 'var(--primary)'};"><i data-lucide="${n.icon || 'bell'}" width="18" height="18"></i></div><div class="notif-item-content"><div class="notif-item-title-row"><div class="notif-item-title">${n.title}</div><span class="notif-unread-dot"></span></div><div class="notif-item-desc">${n.desc}</div><div class="notif-item-footer"><span class="notif-item-time">📅 ${n.time}</span><span class="notif-item-tag" style="background:${n.tagBg || '#f1f5f9'}; color:${n.tagColor || '#475569'};">${n.tag}</span></div></div></div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

async function refreshNotifications(showFeedback = false) {
  if (!currentUser) return;
  if (!FACILITIES || FACILITIES.length === 0) await fetchFacilities('all');
  const roleSubtitle = document.getElementById('notifRoleSubtitle');
  const isVenueOperator = (currentRole === 'owner' || currentRole === 'staff');
  if (roleSubtitle) {
    roleSubtitle.textContent = currentRole === 'admin'
      ? 'System Administrator Governance Alerts'
      : (isVenueOperator ? 'Venue Operations & Booking Notifications' : 'Customer Booking Notifications');
  }

  const notifs = []; const todayYMD = formatYMD(new Date());

  try {
    if (isVenueOperator) {
      const myFacilities = getMyManagedFacilities();
      const myFacIds = myFacilities.map(f => String(f.id));
      if (myFacIds.length > 0) {
        const { data: bookings } = await supabaseClient.from('bookings').select('*').in('facility_id', myFacIds).order('date', { ascending: false }).limit(40);
        if (bookings && bookings.length > 0) {
          const targetView = currentRole === 'owner' ? 'dashboard' : 'payments';
          bookings.forEach(b => {
            const facName = FACILITIES.find(f => String(f.id) === String(b.facility_id))?.name || 'Sports Facility';
            const custName = (b.customer_name || 'Customer').trim();
            const status = (b.payment_status || '').toLowerCase();
            const price = Number(b.total_price || 0);
            if (status === 'pending') notifs.push({ id: `adm_pend_${b.id}`, bookingId: b.id, type: 'pending_slip', icon: 'file-check-2', iconColor: '#d97706', iconBg: '#fef3c7', title: `🟡 New Slip Pending Review: ${custName}`, desc: `Booked ${facName} on ${b.date} (${b.start_time} - ${b.end_time}), Total ฿${price.toLocaleString()}`, tag: 'Pending Slip', tagBg: '#fef3c7', tagColor: '#b45309', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await switchView('payments'); } });
            if (status === 'approved') notifs.push({ id: `adm_appr_${b.id}`, bookingId: b.id, type: 'approved', icon: 'check-circle-2', iconColor: '#16a34a', iconBg: '#dcfce7', title: `🟢 Booking Confirmed: ${custName}`, desc: `${facName} on ${b.date} (${b.start_time} - ${b.end_time}) has been approved`, tag: 'Approved', tagBg: '#dcfce7', tagColor: '#15803d', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await switchView(targetView); } });
            if (status === 'completed') notifs.push({ id: `adm_comp_${b.id}`, bookingId: b.id, type: 'checked_in', icon: 'user-check', iconColor: '#2563eb', iconBg: '#dbeafe', title: `📍 Customer Checked In: ${custName}`, desc: `Checked in at ${facName} for slot ${b.start_time} - ${b.end_time}`, tag: 'Checked In', tagBg: '#dbeafe', tagColor: '#1d4ed8', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await switchView(targetView); } });
            if (status === 'rejected') notifs.push({ id: `adm_rej_${b.id}`, bookingId: b.id, type: 'rejected', icon: 'x-circle', iconColor: '#dc2626', iconBg: '#fee2e2', title: `❌ Booking Cancelled: ${custName}`, desc: `Booking at ${facName} on ${b.date} (${b.start_time} - ${b.end_time}) was rejected/cancelled`, tag: 'Cancelled', tagBg: '#fee2e2', tagColor: '#dc2626', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await switchView(targetView); } });
            if (b.date === todayYMD && status === 'approved') notifs.push({ id: `adm_today_${b.id}`, bookingId: b.id, type: 'today_court', icon: 'calendar-clock', iconColor: '#7c3aed', iconBg: '#f3e8ff', title: `⏰ Today's Session: ${facName}`, desc: `${custName} is scheduled today at ${b.start_time} - ${b.end_time}`, tag: 'Today', tagBg: '#f3e8ff', tagColor: '#7e22ce', time: 'Today', timestamp: Date.now() + 1000, action: async () => { await switchView(targetView); } });
          });
        }
      }
    } else if (currentRole === 'user') {
      const { data: userBookings } = await supabaseClient.from('bookings').select('*').eq('user_id', currentUser.id).order('date', { ascending: false }).limit(30);
      if (userBookings && userBookings.length > 0) {
        userBookings.forEach(b => {
          const facName = FACILITIES.find(f => String(f.id) === String(b.facility_id))?.name || 'Sports Facility';
          const status = (b.payment_status || '').toLowerCase();
          if (status === 'approved') notifs.push({ id: `usr_appr_${b.id}`, bookingId: b.id, type: 'approved', icon: 'ticket', iconColor: '#16a34a', iconBg: '#dcfce7', title: `🟢 Your Booking is Approved!`, desc: `Your E-Ticket for ${facName} on ${b.date} (${b.start_time} - ${b.end_time}) is ready to use`, tag: 'Approved', tagBg: '#dcfce7', tagColor: '#15803d', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await openUserTicketByBookingId(b.id); } });
          if (status === 'pending') notifs.push({ id: `usr_pend_${b.id}`, bookingId: b.id, type: 'pending', icon: 'clock', iconColor: '#d97706', iconBg: '#fef3c7', title: `⏳ Payment Slip Received — Pending Review`, desc: `We received your payment slip for ${facName} on ${b.date} (${b.start_time} - ${b.end_time}). Verification is in progress.`, tag: 'Pending Review', tagBg: '#fef3c7', tagColor: '#b45309', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await switchView('my-bookings'); } });
          if (b.date === todayYMD && status === 'approved') notifs.push({ id: `usr_today_${b.id}`, bookingId: b.id, type: 'reminder', icon: 'alarm-clock', iconColor: '#7c3aed', iconBg: '#f3e8ff', title: `⏰ Reminder: You Have a Game Today!`, desc: `You have a booking at ${facName} today from ${b.start_time} - ${b.end_time}. Please have your E-Ticket ready.`, tag: 'Today', tagBg: '#f3e8ff', tagColor: '#7e22ce', time: 'Today', timestamp: Date.now() + 1000, action: async () => { await openUserTicketByBookingId(b.id); } });
          if (status === 'completed') notifs.push({ id: `usr_comp_${b.id}`, bookingId: b.id, type: 'completed', icon: 'map-pin', iconColor: '#2563eb', iconBg: '#dbeafe', title: `📍 Checked In Successfully!`, desc: `You have checked in at ${facName}. Enjoy your game!`, tag: 'Checked In', tagBg: '#dbeafe', tagColor: '#1d4ed8', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await switchView('history'); } });
          if (status === 'rejected') notifs.push({ id: `usr_rej_${b.id}`, bookingId: b.id, type: 'rejected', icon: 'alert-triangle', iconColor: '#dc2626', iconBg: '#fee2e2', title: `❌ Booking Not Approved`, desc: `Sorry, your booking at ${facName} on ${b.date} (${b.start_time} - ${b.end_time}) was declined. Please check your details.`, tag: 'Declined', tagBg: '#fee2e2', tagColor: '#dc2626', time: b.date, timestamp: new Date(b.created_at || b.date).getTime(), action: async () => { await switchView('my-bookings'); } });
        });
      }
    }
  } catch (err) {}

  // 🚩 Admin: System-level notifications (Issue reports & Unassigned facility governance)
  if (currentRole === 'admin') {
    try {
      const unassignedCount = (FACILITIES || []).filter(f => !f.owner_id).length;
      if (unassignedCount > 0) {
        notifs.push({
          id: `adm_gov_unassigned_${unassignedCount}`,
          type: 'governance',
          icon: 'building-2',
          iconColor: '#d97706',
          iconBg: '#fef3c7',
          title: `⚠️ ${unassignedCount} Unassigned Facility(s)`,
          desc: `There are ${unassignedCount} sports facilities without an assigned Court Owner. Assign an owner in the Facility Directory.`,
          tag: 'Governance',
          tagBg: '#fef3c7',
          tagColor: '#b45309',
          time: 'System Check',
          timestamp: Date.now() + 500,
          action: async () => { await openAdminModule('owners'); }
        });
      }
      const { data: reports, error: rErr } = await supabaseClient.from('issue_reports').select('*')
        .in('status', ['pending', 'in_progress']).order('created_at', { ascending: false }).limit(40);
      if (rErr) throw rErr;
      if (reports && reports.length) {
        const ids = [...new Set(reports.map(r => r.user_id).filter(Boolean))];
        const { data: profs } = await supabaseClient.from('profiles').select('*').in('id', ids);
        const pm = {}; (profs || []).forEach(p => { pm[String(p.id)] = p; });
        reports.forEach(r => {
          const p = pm[String(r.user_id)];
          const who = p?.name || 'User';
          const roleLabel = ISSUE_ROLE_LABELS[p?.role] || p?.role || 'Unknown Role';
          const catLabel = REPORT_CATEGORY_LABELS[r.category] || r.category || 'Other';
          const isInProg = r.status === 'in_progress';
          notifs.push({ id: `adm_issue_${r.id}`, type: 'issue_report', icon: 'flag', iconColor: isInProg ? '#2563eb' : '#dc2626', iconBg: isInProg ? '#dbeafe' : '#fee2e2',
            title: `${isInProg ? '🔧 In Progress' : '🚩 New Issue'} from ${who}`,
            desc: `[${roleLabel}] ${catLabel}: ${String(r.description || '').slice(0, 100)}`,
            tag: isInProg ? 'In Progress' : 'Pending Issue', tagBg: isInProg ? '#dbeafe' : '#fee2e2', tagColor: isInProg ? '#1d4ed8' : '#dc2626',
            time: r.created_at ? new Date(r.created_at).toLocaleDateString('en-US') : '',
            timestamp: new Date(r.created_at || Date.now()).getTime() + 2000,
            action: async () => { await openIssueReportsTab(); } });
        });
      }
    } catch (e) { console.warn('Load issue notifications failed:', e.message); }
  }
  notifs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  currentNotifications = notifs;
  updateNotificationBadges();
  renderNotificationList();
  if (showFeedback) alert(`🔄 Notifications updated (${notifs.length} total)`);
}

async function openUserTicketByBookingId(bookingId) {
  await switchView('my-bookings');
  if (typeof groupedBookingsCache !== 'undefined' && groupedBookingsCache) {
    for (const [groupId, bill] of Object.entries(groupedBookingsCache)) {
      if (bill.bookingIds && bill.bookingIds.includes(bookingId)) { openBookingTicketModal(groupId, false); return; }
    }
  }
  try {
    const { data: b } = await supabaseClient.from('bookings').select('*').eq('id', bookingId).single();
    if (b) {
      const billKey = `${b.date}_${b.facility_id}_${b.created_at || b.id}`;
      groupedBookingsCache[billKey] = {
        groupId: billKey, facility_id: b.facility_id, date: b.date, customer_name: b.customer_name || currentUser?.profile?.name || 'Customer', customer_phone: b.customer_phone || currentUser?.profile?.phone || '-', total_price: b.total_price || 0, payment_status: b.payment_status || 'approved', slip_url: b.slip_url,
        slots: [{ id: b.id, start: b.start_time, end: b.end_time, status: b.payment_status }], completedCount: b.payment_status === 'completed' ? 1 : 0, totalSlots: 1
      };
      openBookingTicketModal(billKey, false);
    }
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (typeof supabaseClient === 'undefined') return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) { currentUser = session.user; await fetchUserProfile(currentUser.id); }
  else { document.getElementById('loginScreen').classList.add('active'); }
});


// ============================================================================
// 🚀 Core Application Functions (Tables, Check-in, Dashboard, Notifications, Stock)
// ============================================================================

filterPayments = function(status) {
  currentPaymentFilter = status;
  ['pending', 'approved', 'rejected'].forEach(s => {
    const btn = document.getElementById(`tab-${s}`);
    if (btn) {
      if (s === status) { btn.style.background = 'var(--primary)'; btn.style.color = 'white'; btn.style.border = 'none'; } 
      else { btn.style.background = 'var(--bg-surface)'; btn.style.color = 'var(--text)'; btn.style.border = '1px solid var(--border)'; }
    }
  });
  const subFilterWrapper = document.getElementById('approvedSubFilter');
  if (subFilterWrapper) {
    subFilterWrapper.style.display = (status === 'approved') ? 'flex' : 'none';
    if (status !== 'approved') { const sub = document.getElementById('paymentSubFilterStatus'); if (sub) sub.value = 'all'; }
  }
  renderPaymentsTable();
};

renderPaymentsTable = async function() {
  const tbody = document.getElementById('paymentsTable');
  if (!tbody) return;
  if (!FACILITIES || FACILITIES.length === 0) await fetchFacilities('all');
  const myFacilities = getMyManagedFacilities();
  const myFacilityIds = myFacilities.map(f => String(f.id));

  const facSelect = document.getElementById('paymentFilterFacility');
  if (facSelect) {
    const prevVal = facSelect.value || 'all';
    facSelect.innerHTML = '<option value="all">🏟️ Show All Managed Facilities</option>' + myFacilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    facSelect.value = (prevVal === 'all' || myFacilityIds.includes(String(prevVal))) ? prevVal : 'all';
  }
  const selectedFacId = facSelect ? facSelect.value : 'all';
  const subFilterStatus = document.getElementById('paymentSubFilterStatus') ? document.getElementById('paymentSubFilterStatus').value : 'all';

  if (myFacilityIds.length === 0) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-tertiary);">You do not have any managed sports facilities yet</td></tr>`; return; }
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px;">Loading records...</td></tr>';

  let dbStatusFilter = [currentPaymentFilter, currentPaymentFilter.toUpperCase(), currentPaymentFilter.charAt(0).toUpperCase() + currentPaymentFilter.slice(1)];
  if (currentPaymentFilter === 'approved') dbStatusFilter = ['approved', 'APPROVED', 'Approved', 'completed', 'COMPLETED', 'Completed'];

  const { data: allBookings, error } = await supabaseClient.from('bookings').select('*').in('facility_id', myFacilityIds).in('payment_status', dbStatusFilter).order('created_at', { ascending: false });
  if (error || !allBookings || allBookings.length === 0) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">No bookings found in this category</td></tr>`; return; }

  const allBills = groupBookingsIntoBills(allBookings);
  const bills = allBills.filter(b => {
    if (selectedFacId !== 'all' && String(b.facility_id) !== String(selectedFacId)) return false;
    const bStatus = String(b.payment_status).toLowerCase();
    if (currentPaymentFilter === 'approved') {
       if (bStatus !== 'approved' && bStatus !== 'completed') return false;
       if (subFilterStatus === 'completed') return b.isAllCompleted;
       if (subFilterStatus === 'waiting_checkin') return !b.isAllCompleted;
       return true; 
    }
    return bStatus === currentPaymentFilter; 
  });

  if (bills.length === 0) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">No bookings match the selected filter</td></tr>`; return; }

  tbody.innerHTML = bills.map(bill => {
    const facility = FACILITIES.find(f => f.id === bill.facility_id) || { name: 'Sports Facility' };
    const statusLower = (bill.payment_status || '').toLowerCase();
    const slotListHtml = bill.slots.map(s => { const isDone = s.status === 'completed'; return `<span style="display:inline-block; background:${isDone ? '#dbeafe' : '#f1f5f9'}; color:${isDone ? '#1d4ed8' : '#334155'}; padding:2px 6px; border-radius:4px; font-size:0.74rem; font-weight:600; margin:2px 4px 2px 0;">${isDone ? '✓ ' : ''}${s.start}-${s.end}</span>`; }).join('');

    let actionButtons = `<button onclick="openBookingTicketModal('${bill.groupId}', true)" class="btn" style="background:#e2e8f0; color:#1e293b; padding:5px 10px; border-radius:4px; font-size:0.76rem;">View Bill / Check-in Slots</button>`;
    if (statusLower === 'pending') { actionButtons += `<button onclick="processGroupBookingStatus('${bill.groupId}', 'approved')" class="btn" style="background:#22c55e; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">Approve Slip</button><button onclick="processGroupBookingStatus('${bill.groupId}', 'rejected')" class="btn" style="background:#ef4444; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">Reject</button>`; } 
    else if (statusLower === 'approved') { const remaining = bill.slots.filter(s => s.status === 'approved').length; if (remaining > 0) { actionButtons += `<button onclick="confirmGroupCheckIn('${bill.groupId}')" class="btn" style="background:#2563eb; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">✅ Check In (${remaining} hr)</button>`; } }

    let statusBadgeHtml = '';
    if (statusLower === 'completed') statusBadgeHtml = `<span style="background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">Checked In</span>`;
    else if (bill.isPartiallyCheckedIn) statusBadgeHtml = `<span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">Checked In ${bill.completedCount}/${bill.totalSlots}</span>`;
    else if (statusLower === 'approved') statusBadgeHtml = `<span class="status-badge approved" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">Awaiting Check-in</span>`;
    else if (statusLower === 'pending') statusBadgeHtml = `<span class="status-badge pending" style="background:#fef9c3; color:#a16207; border:1px solid #fde047;">Pending Slip Review</span>`;
    else statusBadgeHtml = `<span class="status-badge rejected" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca;">Cancelled / Rejected</span>`;

    const slipCellHtml = (bill.slip_url && bill.slip_url !== 'walk-in' && !String(bill.slip_url).startsWith('walkin_')) ? `<button type="button" onclick="previewSlipModal('${String(bill.slip_url).trim()}')" style="background:none; border:none; color:var(--primary); text-decoration:underline; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.85rem;">🖼️ View Slip</button>` : '<span style="color:var(--text-tertiary); font-size:0.78rem;">Walk-in / Admin</span>';

    return `<tr><td><strong style="cursor:pointer; color:var(--primary);" onclick="openBookingTicketModal('${bill.groupId}', true)">#${String(bill.groupId).slice(0, 8)}</strong><div style="font-size:0.72rem; color:var(--text-tertiary);">${bill.slots.length} slot(s)</div></td><td><strong>${bill.customer_name}</strong><div style="font-size:0.78rem; color:var(--text-secondary);">📞 ${bill.customer_phone}</div></td><td><strong>${facility.name}</strong><div style="font-size:0.78rem; color:var(--text-secondary);">📅 ${bill.date}</div><div style="margin-top:2px;">${slotListHtml}</div></td><td><strong style="color:var(--primary);">฿${bill.total_price.toLocaleString()}</strong></td><td>${slipCellHtml}</td><td>${statusBadgeHtml}</td><td><div style="display:flex; gap:6px; flex-wrap:wrap;">${actionButtons}</div></td></tr>`;
  }).join('');
};

async function processGroupBookingStatus(groupId, status) {
  if (currentRole === 'admin') { alert('RBAC Policy: Platform Administrators have read-only audit access. Payment approvals are restricted to Facility Owners and Staff.'); return; }
  const bill = groupedBookingsCache[groupId]; if (!bill) return;
  const actionText = status === 'approved' ? 'Approve' : 'Reject';
  if (!confirm(`Are you sure you want to "${actionText}" the booking for ${bill.customer_name} (${bill.slots.length} hour(s), total ฿${bill.total_price.toLocaleString()})?`)) return;
  try {
    const { error } = await supabaseClient.from('bookings').update({ payment_status: status }).in('id', bill.bookingIds);
    if (error) throw error;
    await supabaseClient.from('payments').update({ status: status, verified_at: new Date().toISOString() }).in('booking_id', bill.bookingIds);
    alert(`Booking ${actionText.toLowerCase()}d successfully!`);
    renderPaymentsTable();
  } catch (err) { alert('Error updating booking status: ' + err.message); }
}

async function checkInSingleSlot(bookingId, groupId = null) {
  if (currentRole === 'admin') { alert('RBAC Policy: Manual court check-ins are restricted to Facility Owners and Front-Desk Staff.'); return; }
  const cleanId = String(bookingId).trim();
  if (!confirm('Confirm check-in for this time slot?')) return;
  try {
    const { error } = await supabaseClient.from('bookings').update({ payment_status: 'completed' }).eq('id', cleanId);
    if (error) throw error;
    const group = groupId ? groupedBookingsCache[groupId] : Object.values(groupedBookingsCache).find(g => g.bookingIds.map(String).includes(cleanId));
    if (group) {
      const remaining = group.slots.filter(s => String(s.id) !== cleanId && s.status !== 'completed').length;
      if (remaining > 0) alert(`✅ Time slot checked in! (${remaining} remaining slot(s) in this bill awaiting check-in)`);
      else { alert('🎉 All time slots in this bill have been checked in!'); closeModal('bookingTicketModal'); }
    } else alert('✅ Time slot checked in successfully!');

    if (currentView === 'slots') await loadSlotManagementData();
    if (currentView === 'payments') await renderPaymentsTable();
    if (currentView === 'my-bookings') await renderMyBookings();
    
    if (group && document.getElementById('bookingTicketModal')?.classList.contains('active')) {
      const { data: refreshed } = await supabaseClient.from('bookings').select('*').in('id', group.bookingIds);
      if (refreshed) {
        const updatedBills = groupBookingsIntoBills(refreshed);
        if (updatedBills[0] && !updatedBills[0].isAllCompleted) openBookingTicketModal(updatedBills[0].groupId, true);
        else closeModal('bookingTicketModal');
      }
    }
  } catch (err) { alert('Check-in failed: ' + err.message); }
}

async function confirmGroupCheckIn(groupId) {
  if (currentRole === 'admin') { alert('RBAC Policy: Manual court check-ins are restricted to Facility Owners and Front-Desk Staff.'); return; }
  const bill = groupedBookingsCache[groupId]; if (!bill) return;
  const remainingSlots = bill.slots.filter(s => s.status !== 'completed');
  if (!confirm(`Confirm full check-in for "${bill.customer_name}" (${remainingSlots.length} hour(s))?`)) return;
  try {
    const { error } = await supabaseClient.from('bookings').update({ payment_status: 'completed' }).in('id', bill.bookingIds);
    if (error) throw error;
    alert('✅ All slots in this bill have been checked in!');
    closeModal('bookingTicketModal');
    if (currentView === 'payments') renderPaymentsTable();
    if (currentView === 'slots') loadSlotManagementData();
    if (currentView === 'my-bookings') renderMyBookings();
  } catch (err) { alert('Check-in failed: ' + err.message); }
}

function getClearedRejectedSlotIds() { try { const raw = localStorage.getItem('sportcircle_cleared_rejected_slots'); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
function addClearedRejectedSlotId(bookingId) { const list = getClearedRejectedSlotIds(); const idStr = String(bookingId); if (!list.includes(idStr)) { list.push(idStr); try { localStorage.setItem('sportcircle_cleared_rejected_slots', JSON.stringify(list)); } catch (e) {} } }

renderDashboardStats = async function() {
  if (!FACILITIES || FACILITIES.length === 0) await fetchFacilities('all');
  const myFacilities = getMyManagedFacilities();
  const myFacilityIds = myFacilities.map(f => String(f.id));

  const facSelect = document.getElementById('dashFilterFacility');
  if (facSelect) { const currentVal = facSelect.value || 'all'; facSelect.innerHTML = '<option value="all">🏟️ All Managed Facilities</option>' + myFacilities.map(f => `<option value="${f.id}">${f.name} (${f.sport || '-'})</option>`).join(''); facSelect.value = (currentVal === 'all' || myFacilityIds.includes(String(currentVal))) ? currentVal : 'all'; }
  const eqFacSelect = document.getElementById('dashEquipmentFacilityFilter');
  if (eqFacSelect) { const curEqVal = eqFacSelect.value || 'all'; eqFacSelect.innerHTML = '<option value="all">🏟️ All Facilities Equipment</option>' + myFacilities.map(f => `<option value="${f.id}">${f.name}</option>`).join(''); eqFacSelect.value = (curEqVal === 'all' || myFacilityIds.includes(String(curEqVal))) ? curEqVal : 'all'; }

  const selectedFacId = facSelect ? facSelect.value : 'all';
  const periodType = document.getElementById('dashReportPeriodType')?.value || 'monthly';
  const todayYMD = formatYMD(new Date());

  let filterStartDate = '', filterEndDate = '';
  if (periodType === 'daily') { filterStartDate = filterEndDate = document.getElementById('dashRealtimeDate')?.value || todayYMD; } 
  else if (periodType === 'monthly') { const month = document.getElementById('dashReportMonth')?.value || String(new Date().getMonth() + 1).padStart(2, '0'), year = document.getElementById('dashReportYear')?.value || String(new Date().getFullYear()); filterStartDate = `${year}-${month}-01`; filterEndDate = `${year}-${month}-${String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')}`; } 
  else if (periodType === 'yearly') { const year = document.getElementById('dashReportYear')?.value || String(new Date().getFullYear()); filterStartDate = `${year}-01-01`; filterEndDate = `${year}-12-31`; } 
  else if (periodType === 'custom') { filterStartDate = document.getElementById('dashFilterStartDate')?.value || ''; filterEndDate = document.getElementById('dashFilterEndDate')?.value || ''; }

  let list = [];
  if (myFacilityIds.length > 0) {
    let query = supabaseClient.from('bookings').select('*').in('facility_id', myFacilityIds);
    if (selectedFacId && selectedFacId !== 'all') query = query.eq('facility_id', selectedFacId);
    if (filterStartDate) query = query.gte('date', filterStartDate);
    if (filterEndDate) query = query.lte('date', filterEndDate);
    const { data: bookings, error } = await query;
    if (!error && bookings) list = bookings;
  }

  dashFilteredBookingsCache = list;
  let totalRevenue = 0, pendingSlots = 0, completedSlots = 0, activeBookingsCount = 0, cancelledSlotsCount = 0;
  const sportRevenueMap = { football: 0, badminton: 0, basketball: 0, futsal: 0, volleyball: 0 };
  const facilityStatMap = {};
  myFacilities.forEach(f => { facilityStatMap[f.id] = { name: f.name, approvedCount: 0, cancelCount: 0, revenue: 0 }; });

  list.forEach(b => {
    const st = (b.payment_status || '').toLowerCase(), price = Number(b.total_price || 0), facId = String(b.facility_id);
    if (st === 'rejected') {
      cancelledSlotsCount++; if (facilityStatMap[facId]) facilityStatMap[facId].cancelCount++;
    } else {
      activeBookingsCount++;
      if (st === 'pending') pendingSlots++; if (st === 'completed') completedSlots++;
      if (st === 'approved' || st === 'completed') {
        totalRevenue += price;
        if (facilityStatMap[facId]) { facilityStatMap[facId].approvedCount++; facilityStatMap[facId].revenue += price; }
        const fac = FACILITIES.find(f => String(f.id) === facId), sportKey = (fac?.sport || '').toLowerCase();
        if (sportRevenueMap[sportKey] !== undefined) sportRevenueMap[sportKey] += price; else if (sportKey) sportRevenueMap[sportKey] = (sportRevenueMap[sportKey] || 0) + price;
      }
    }
  });

  let totalAddonRevenue = 0, totalRentQty = 0, totalBuyQty = 0;
  const groupedBills = groupBookingsIntoBills(list);
  groupedBills.forEach(bill => {
    const st = String(bill.payment_status || '').toLowerCase();
    if (st === 'approved' || st === 'completed') {
      let addonsArr = bill.addons;
      if (typeof addonsArr === 'string') { try { addonsArr = JSON.parse(addonsArr); } catch (e) { addonsArr = []; } }
      if (Array.isArray(addonsArr)) {
        addonsArr.forEach(a => {
          const qty = Number(a.qty || 0), price = Number(a.price || 0);
          if (qty > 0) { totalAddonRevenue += (qty * price); if (isRentType(a.type)) totalRentQty += qty; else totalBuyQty += qty; }
        });
      }
    }
  });

  let todayUsersCount = 0, todaySlotsCount = 0;
  try {
    if (myFacilityIds.length > 0) {
      const { data: todayBookings } = await supabaseClient.from('bookings').select('customer_name, customer_phone, payment_status').in('facility_id', myFacilityIds).eq('date', todayYMD).neq('payment_status', 'rejected');
      if (todayBookings) { todaySlotsCount = todayBookings.length; todayUsersCount = new Set(todayBookings.map(b => (b.customer_name || b.customer_phone || '').trim()).filter(Boolean)).size || todaySlotsCount; }
    }
  } catch (e) {}

  if (document.getElementById('dashTotalRevenue')) document.getElementById('dashTotalRevenue').textContent = '฿' + totalRevenue.toLocaleString();
  if (document.getElementById('dashCompletedSubText')) document.getElementById('dashCompletedSubText').textContent = `Checked in: ${completedSlots.toLocaleString()} hr(s)`;
  if (document.getElementById('dashAddonRevenue')) document.getElementById('dashAddonRevenue').textContent = '฿' + totalAddonRevenue.toLocaleString();
  if (document.getElementById('dashAddonSubText')) document.getElementById('dashAddonSubText').textContent = `Rented ${totalRentQty.toLocaleString()} | Sold ${totalBuyQty.toLocaleString()}`;
  if (document.getElementById('dashTodayUsersCount')) document.getElementById('dashTodayUsersCount').textContent = `${todayUsersCount.toLocaleString()} users`;
  if (document.getElementById('dashTodaySlotsSubText')) document.getElementById('dashTodaySlotsSubText').textContent = `${todaySlotsCount.toLocaleString()} slot(s) booked today`;
  if (document.getElementById('dashTotalBookings')) document.getElementById('dashTotalBookings').textContent = `${activeBookingsCount.toLocaleString()} hr(s)`;
  if (document.getElementById('dashTotalBillsSubText')) document.getElementById('dashTotalBillsSubText').textContent = `Out of ${list.length.toLocaleString()} total records`;
  if (document.getElementById('dashPendingBookings')) document.getElementById('dashPendingBookings').textContent = `${pendingSlots.toLocaleString()} hr(s)`;
  if (document.getElementById('dashCompletedBookings')) document.getElementById('dashCompletedBookings').textContent = completedSlots.toLocaleString();
  if (document.getElementById('dashCancelledBookings')) document.getElementById('dashCancelledBookings').textContent = `${cancelledSlotsCount.toLocaleString()} times`;
  const cancelRate = (activeBookingsCount + cancelledSlotsCount) > 0 ? ((cancelledSlotsCount / (activeBookingsCount + cancelledSlotsCount)) * 100).toFixed(1) : 0;
  if (document.getElementById('dashCancelRateSubText')) document.getElementById('dashCancelRateSubText').textContent = `Cancellation rate: ${cancelRate}%`;

  const labels = ['Football', 'Badminton', 'Basketball', 'Futsal', 'Volleyball'];
  const dataPoints = labels.map(l => sportRevenueMap[l.toLowerCase()] || 0);
  const ctx3 = document.getElementById('revenueChart');
  if (ctx3 && typeof Chart !== 'undefined') {
    if (window.revenueChartInstance) { window.revenueChartInstance.data.datasets[0].data = dataPoints; window.revenueChartInstance.update(); } 
    else { window.revenueChartInstance = new Chart(ctx3, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Revenue (฿)', data: dataPoints, backgroundColor: ['#16a34a', '#2563eb', '#f59e0b', '#ec4899', '#8b5cf6'], borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, y: { grid: { display: false } } } } }); }
  }

  const summaryTableBody = document.getElementById('dashReportSummaryTable');
  if (summaryTableBody) {
    const rowsHtml = Object.values(facilityStatMap).map(item => `<tr><td><strong>${item.name}</strong></td><td><span style="color:#16a34a; font-weight:700;">${item.approvedCount} hr(s)</span></td><td><span style="color:#dc2626; font-weight:600;">${item.cancelCount} time(s)</span></td><td><strong style="color:var(--primary);">฿${item.revenue.toLocaleString()}</strong></td></tr>`).join('');
    summaryTableBody.innerHTML = rowsHtml || '<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--text-tertiary);">No data found for this period</td></tr>';
  }

  await renderDashboardEquipmentSection();
  await renderMultiCourtMatrix();
};

async function renderDashboardEquipmentSection() {
  const container = document.getElementById('dashEquipmentStockList'); if (!container) return;
  const myFacilities = getMyManagedFacilities(); const myFacilityIds = myFacilities.map(f => String(f.id));
  if (myFacilityIds.length === 0) { container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-tertiary);">No managed sports facilities yet</div>'; return; }

  const eqFacFilter = document.getElementById('dashEquipmentFacilityFilter')?.value || 'all';
  const targetFacIds = (eqFacFilter === 'all') ? myFacilityIds : [String(eqFacFilter)];
  const { data: eqList, error } = await supabaseClient.from('equipment').select('*').in('facility_id', targetFacIds).order('created_at', { ascending: false });

  if (error || !eqList || eqList.length === 0) { container.innerHTML = `<div style="text-align:center; padding:24px; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; color:var(--text-secondary); font-size:0.88rem;">📦 No add-on equipment items for the selected facility<div style="margin-top:8px;"><button type="button" class="btn btn-primary" style="padding:6px 14px; font-size:0.8rem;" onclick="switchView('manage-facilities')">+ Add Equipment in Facility Management</button></div></div>`; return; }

  const usageMap = {};
  const bills = groupBookingsIntoBills(dashFilteredBookingsCache || []);
  bills.forEach(bill => {
    const st = String(bill.payment_status || '').toLowerCase();
    if (st === 'approved' || st === 'completed') {
      let addonsArr = bill.addons;
      if (typeof addonsArr === 'string') { try { addonsArr = JSON.parse(addonsArr); } catch (e) { addonsArr = []; } }
      if (Array.isArray(addonsArr)) {
        addonsArr.forEach(a => {
          const idKey = String(a.id);
          if (!usageMap[idKey]) usageMap[idKey] = { qty: 0, revenue: 0 };
          usageMap[idKey].qty += Number(a.qty || 0); usageMap[idKey].revenue += (Number(a.qty || 0) * Number(a.price || 0));
        });
      }
    }
  });

  container.innerHTML = `<div class="dash-eq-grid">
    ${eqList.map(eq => {
      const fac = FACILITIES.find(f => String(f.id) === String(eq.facility_id)), stat = usageMap[String(eq.id)] || { qty: 0, revenue: 0 }, isRent = isRentType(eq.type), badgeBg = isRent ? '#eff6ff' : '#fef3c7', badgeColor = isRent ? '#1d4ed8' : '#b45309', actionWord = isRent ? 'Rented' : 'Sold';
      return `<div class="dash-eq-card"><div><div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;"><div><strong style="font-size:0.95rem; color:var(--text);">${eq.name}</strong><div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">🏟️ ${fac?.name || '-'}</div></div><span style="background:${badgeBg}; color:${badgeColor}; padding:3px 10px; border-radius:999px; font-size:0.72rem; font-weight:700; white-space:nowrap;">${translateEquipmentType(eq.type)} · ฿${Number(eq.price || 0).toLocaleString()}</span></div><div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:8px 10px; background:#f8fafc; border-radius:8px; font-size:0.8rem;"><span style="color:var(--text-secondary);">${actionWord}: <strong style="color:var(--text);">${stat.qty} pcs</strong></span><span style="color:#16a34a; font-weight:700;">Revenue: ฿${stat.revenue.toLocaleString()}</span></div></div><div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px dashed var(--border-light); gap:8px;"><span style="font-size:0.8rem; font-weight:600; color:${eq.stock > 0 ? '#334155' : 'var(--error)'};">Remaining Stock:</span><div style="display:flex; align-items:center; gap:6px;"><div class="eq-stock-stepper"><button type="button" onclick="adjustDashboardEqStock('${eq.id}', -1)">-</button><input type="number" id="dashEqStockInput_${eq.id}" value="${eq.stock}" min="0" onchange="saveDashboardEqStockDirect('${eq.id}')"><button type="button" onclick="adjustDashboardEqStock('${eq.id}', 1)">+</button></div></div></div></div>`;
    }).join('')}
  </div>`;
}

async function adjustDashboardEqStock(eqId, delta) {
  const inputEl = document.getElementById(`dashEqStockInput_${eqId}`); if (!inputEl) return;
  inputEl.value = Math.max(0, (parseInt(inputEl.value) || 0) + delta);
  await saveDashboardEqStockDirect(eqId);
}
async function saveDashboardEqStockDirect(eqId) {
  const inputEl = document.getElementById(`dashEqStockInput_${eqId}`); if (!inputEl) return;
  const newStock = Math.max(0, parseInt(inputEl.value) || 0); inputEl.value = newStock;
  const { error } = await supabaseClient.from('equipment').update({ stock: newStock }).eq('id', eqId);
  if (error) alert('Failed to update stock: ' + error.message);
}

renderMultiCourtMatrix = async function() {
  const container = document.getElementById('dashMultiCourtMatrix'); if (!container) return;
  if (!FACILITIES || FACILITIES.length === 0) await fetchFacilities('all');
  const myFacilities = getMyManagedFacilities();
  if (myFacilities.length === 0) { container.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-tertiary);">No managed sports facilities found</div>'; return; }

  const targetDateStr = formatYMD(currentMatrixDate), isToday = (targetDateStr === formatYMD(new Date()));
  const dateInput = document.getElementById('dashMatrixDatePicker'); if (dateInput) dateInput.value = targetDateStr;
  const titleEl = document.getElementById('matrixSectionTitle'); if (titleEl) titleEl.textContent = isToday ? "Today's Court Schedule & Live Status" : `Court Schedule & Status (${formatThaiDateDisplay(currentMatrixDate)})`;

  const courtFilterSelect = document.getElementById('dashMatrixCourtFilter');
  if (courtFilterSelect) {
    const curFilterVal = currentMatrixCourtFilter || 'all';
    courtFilterSelect.innerHTML = `<option value="all">Show All Facilities (${myFacilities.length})</option>` + myFacilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    courtFilterSelect.value = curFilterVal;
  }
  const displayedFacilities = (currentMatrixCourtFilter === 'all') ? myFacilities : myFacilities.filter(f => String(f.id) === String(currentMatrixCourtFilter));

  let hours = [];
  if (currentMatrixTimeRange === 'evening') hours = [16, 17, 18, 19, 20, 21];
  else if (currentMatrixTimeRange === 'morning') hours = [8, 9, 10, 11, 12, 13, 14, 15];
  else hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

  let bookings = [], timeBlocks = [];
  try {
    const myFacIds = myFacilities.map(f => String(f.id));
    const [bRes, tbRes] = await Promise.all([ supabaseClient.from('bookings').select('*').in('facility_id', myFacIds).eq('date', targetDateStr), supabaseClient.from('time_blocks').select('*').in('facility_id', myFacIds).eq('date', targetDateStr) ]);
    if (bRes.data) bookings = bRes.data; if (tbRes.data) timeBlocks = tbRes.data;
  } catch (err) {}
  currentMatrixBookingsCache = bookings; currentMatrixBlocksCache = timeBlocks;
  const clearedRejectedIds = getClearedRejectedSlotIds();

  let tableHtml = `<table class="matrix-table"><thead><tr><th class="th-court">Facility / Time</th>${hours.map(h => `<th>${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00</th>`).join('')}</tr></thead><tbody>`;
  displayedFacilities.forEach(fac => {
    const dotColor = getSportColor(fac.sport);
    tableHtml += `<tr><td class="td-court"><span class="court-dot" style="background:${dotColor};"></span><span>${fac.name}</span></td>`;
    hours.forEach(hourNum => {
      const startSlotStr = `${String(hourNum).padStart(2, '0')}:00`, endSlotStr = `${String(hourNum + 1).padStart(2, '0')}:00`;
      const matchingBookings = bookings.filter(b => String(b.facility_id) === String(fac.id) && hourNum >= parseInt(b.start_time) && hourNum < parseInt(b.end_time));
      const activeBooking = matchingBookings.find(b => (b.payment_status || '').toLowerCase() !== 'rejected');
      const rejectedBooking = matchingBookings.find(b => (b.payment_status || '').toLowerCase() === 'rejected' && !clearedRejectedIds.includes(String(b.id)));
      const targetBooking = activeBooking || rejectedBooking;
      const isBlocked = timeBlocks.find(tb => String(tb.facility_id) === String(fac.id) && hourNum >= parseInt(tb.blocked_start) && hourNum < parseInt(tb.blocked_end));

      if (targetBooking) {
        const status = (targetBooking.payment_status || 'approved').toLowerCase(), custName = (targetBooking.customer_name || 'Customer').trim(), custPhone = targetBooking.customer_phone || '', price = Number(targetBooking.total_price || 0);
        if (status === 'completed') tableHtml += `<td><button type="button" class="matrix-slot-pill slot-booked" onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')" title="${custName} (Checked In) | Tel: ${custPhone} | ฿${price}">${custName} (Checked In)</button></td>`;
        else if (status === 'approved') tableHtml += `<td><button type="button" class="matrix-slot-pill slot-booked" onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')" title="${custName} (Booked) | Tel: ${custPhone} | ฿${price}">${custName}</button></td>`;
        else if (status === 'pending') tableHtml += `<td><button type="button" class="matrix-slot-pill slot-pending" onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')" title="${custName} (Pending Slip) | Tel: ${custPhone} | ฿${price}">${custName} (Pending)</button></td>`;
        else if (status === 'rejected') tableHtml += `<td><button type="button" class="matrix-slot-pill slot-cancelled" onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')" title="Cancelled by ${custName} | Click to clear or rebook">Cancelled</button></td>`;
      } else if (isBlocked) { tableHtml += `<td><button type="button" class="matrix-slot-pill slot-blocked" onclick="alert('⛔ This court slot is temporarily blocked: ${translateBlockReason(isBlocked.reason || 'Closed')}')">Blocked</button></td>`; } 
      else { tableHtml += `<td><button type="button" class="matrix-slot-pill slot-available" onclick="openMatrixWalkInModal('${fac.id}', '${startSlotStr}', '${endSlotStr}')">Available</button></td>`; }
    });
    tableHtml += `</tr>`;
  });
  tableHtml += `</tbody></table>`; container.innerHTML = tableHtml;
};

async function getAvailableEquipmentForSlot(facilityId, dateStr, hourNum) {
  const { data: eqData } = await supabaseClient.from('equipment').select('*').eq('facility_id', facilityId).order('created_at', { ascending: false });
  const eqList = eqData || []; if (eqList.length === 0) return [];
  const bookingsInDate = (currentMatrixBookingsCache && currentMatrixBookingsCache.length > 0 && currentMatrixBookingsCache[0]?.date === dateStr) ? currentMatrixBookingsCache : ((await supabaseClient.from('bookings').select('*').eq('facility_id', facilityId).eq('date', dateStr)).data || []);
  const rentedInHour = {};
  bookingsInDate.forEach(b => {
    const st = String(b.payment_status || '').toLowerCase(); if (st === 'rejected') return;
    const bStart = parseInt(b.start_time), bEnd = parseInt(b.end_time);
    if (hourNum >= bStart && hourNum < bEnd) {
      let addonsArr = b.addons; if (typeof addonsArr === 'string') { try { addonsArr = JSON.parse(addonsArr); } catch (e) { addonsArr = []; } }
      if (Array.isArray(addonsArr)) { addonsArr.forEach(a => { if (isRentType(a.type)) rentedInHour[a.id] = (rentedInHour[a.id] || 0) + Number(a.qty || 0); }); }
    }
  });
  return eqList.map(eq => {
    const availableStock = isRentType(eq.type) ? Math.max(0, Number(eq.stock || 0) - (rentedInHour[eq.id] || 0)) : Math.max(0, Number(eq.stock || 0));
    return { ...eq, availableStock };
  });
}

openMatrixSlotModal = async function(bookingId, facilityId, startSlotStr, endSlotStr) {
  const booking = (currentMatrixBookingsCache || []).find(b => String(b.id) === String(bookingId));
  const facility = (FACILITIES || []).find(f => String(f.id) === String(facilityId)) || { name: 'Sports Facility' };
  if (!booking) { alert('Booking details not found'); return; }
  const modal = document.getElementById('slotDetailModal'), body = document.getElementById('slotDetailBody'), footer = document.getElementById('slotDetailFooter'), title = document.getElementById('slotModalTitle');
  if (!modal || !body || !footer) return;

  const status = (booking.payment_status || 'approved').toLowerCase();
  let statusBadgeHtml = '';
  if (status === 'completed') statusBadgeHtml = '<span style="background:#dbeafe; color:#1d4ed8; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">✓ Checked In</span>';
  else if (status === 'approved') statusBadgeHtml = '<span style="background:#dcfce7; color:#15803d; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">● Booked (Awaiting Check-in)</span>';
  else if (status === 'pending') statusBadgeHtml = '<span style="background:#fef9c3; color:#a16207; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">⏳ Pending Slip Verification</span>';
  else if (status === 'rejected') statusBadgeHtml = '<span style="background:#fee2e2; color:#ef4444; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">✕ Rejected / Cancelled</span>';

  if (title) title.textContent = `Booking Details: ${facility.name}`;

  const customerName = booking.customer_name || 'Unspecified', customerPhone = booking.customer_phone || '-', price = Number(booking.total_price || 0);
  let addonsList = booking.addons;
  if (typeof addonsList === 'string') { try { addonsList = JSON.parse(addonsList); } catch (e) { addonsList = []; } }
  if (!Array.isArray(addonsList)) addonsList = [];
  let addonsHtml = '';
  if (addonsList.length > 0) {
    addonsHtml = `<div style="margin-top:12px; padding:10px 12px; background:#fffbeb; border-radius:8px; border:1px solid #fde68a; font-size:0.82rem;"><strong style="color:#b45309;">📦 Add-on Equipment in this Bill:</strong><ul style="margin:4px 0 0 18px; padding:0; color:#92400e;">${addonsList.map(a => `<li>${a.name} (${translateEquipmentType(a.type)}) x ${a.qty} = <strong>฿${(Number(a.price || 0) * Number(a.qty || 1)).toLocaleString()}</strong></li>`).join('')}</ul></div>`;
  }

  let adminAddEquipmentSectionHtml = '';
  if (status === 'approved' || status === 'pending') {
    adminAddEquipmentSectionHtml = `<div style="margin-top:14px; padding:12px; background:#f0f9ff; border:1.5px dashed #7dd3fc; border-radius:10px;"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;"><span style="font-size:0.84rem; font-weight:700; color:#0369a1;">➕ Add Equipment (Rent / Buy) to this Bill?</span><button type="button" class="btn" style="background:#0284c7; color:#fff; padding:5px 12px; font-size:0.76rem; border-radius:6px;" onclick="loadSlotModalAddonPicker('${booking.id}', '${facility.id}', '${booking.date}', '${booking.start_time}')">📦 Select Equipment</button></div><div id="slotModalAddonPickerBox" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid #bae6fd;"></div></div>`;
  } else if (status === 'completed') {
    adminAddEquipmentSectionHtml = `<div style="margin-top:12px; font-size:0.78rem; color:var(--text-tertiary); background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">ℹ️ This booking is already checked in; equipment cannot be added retroactively.</div>`;
  }

  let slipHtml = '';
  if (booking.slip_url && booking.slip_url !== 'walk-in' && !String(booking.slip_url).startsWith('walkin_')) {
    const safeSlip = String(booking.slip_url).trim();
    slipHtml = `<div style="margin-top:14px; padding:12px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;"><div style="font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:8px;">🖼️ Payment Proof (Transfer Slip):</div><div style="display:flex; align-items:center; gap:12px;"><img src="${safeSlip}" alt="Slip" style="width:75px; height:75px; object-fit:cover; border-radius:8px; cursor:pointer; border:1px solid #cbd5e1;" onclick="previewSlipModal('${safeSlip}')"><div><div style="font-size:0.8rem; color:var(--text-secondary);">Tap the image to view full-size slip</div><button type="button" class="btn" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:4px 10px; font-size:0.75rem; border-radius:6px; margin-top:4px;" onclick="previewSlipModal('${safeSlip}')">🔍 View Full Slip</button></div></div></div>`;
  } else {
    slipHtml = `<div style="margin-top:10px; font-size:0.8rem; color:#15803d; font-weight:600;">💵 Walk-in / Direct Front-Desk Booking</div>`;
  }

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px dashed #e2e8f0; padding-bottom:12px;"><div><div style="font-size:0.75rem; color:var(--text-tertiary);">Booking ID</div><div style="font-size:0.85rem; font-weight:700; color:#1e293b;">#${booking.id}</div></div><div>${statusBadgeHtml}</div></div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; font-size:0.88rem;"><div><div style="font-size:0.75rem; color:var(--text-tertiary);">🏟️ Facility</div><div style="font-weight:700; color:#1e293b;">${facility.name}</div></div><div><div style="font-size:0.75rem; color:var(--text-tertiary);">📅 Date</div><div style="font-weight:700; color:#1e293b;">${booking.date}</div></div><div><div style="font-size:0.75rem; color:var(--text-tertiary);">⏰ Time Slot</div><div style="font-weight:700; color:#2563eb;">${booking.start_time} - ${booking.end_time}</div></div><div><div style="font-size:0.75rem; color:var(--text-tertiary);">💰 Net Total</div><div style="font-weight:800; color:#16a34a; font-size:1.05rem;">฿${price.toLocaleString()}</div></div><div><div style="font-size:0.75rem; color:var(--text-tertiary);">👤 Customer Name</div><div style="font-weight:700; color:#1e293b;">${customerName}</div></div><div><div style="font-size:0.75rem; color:var(--text-tertiary);">📞 Phone Number</div><div style="font-weight:700; display:flex; align-items:center; gap:6px;"><a href="tel:${customerPhone}" style="color:#2563eb; text-decoration:none;">${customerPhone}</a>${customerPhone !== '-' ? `<a href="tel:${customerPhone}" class="btn" style="padding:2px 8px; font-size:0.7rem; background:#dbeafe; color:#1d4ed8; border-radius:6px;">📞 Call</a>` : ''}</div></div></div>
    ${addonsHtml}${adminAddEquipmentSectionHtml}${slipHtml}
  `;

  let actionButtonsHtml = '';
  if (status === 'pending') { actionButtonsHtml = `<button type="button" class="btn" style="background:#16a34a; color:white; padding:8px 16px; font-weight:700;" onclick="quickMatrixApprove('${booking.id}')">✅ Approve Slip</button><button type="button" class="btn" style="background:#fee2e2; color:#ef4444; padding:8px 14px; font-weight:600;" onclick="quickMatrixReject('${booking.id}')">❌ Reject Booking</button>`; } 
  else if (status === 'approved') { actionButtonsHtml = `<button type="button" class="btn" style="background:#2563eb; color:white; padding:8px 16px; font-weight:700;" onclick="quickMatrixCheckIn('${booking.id}')">📍 Check In Customer</button><button type="button" class="btn" style="background:#fee2e2; color:#ef4444; padding:8px 14px; font-weight:600;" onclick="quickMatrixReject('${booking.id}')">❌ Cancel Booking</button>`; } 
  else if (status === 'completed') { actionButtonsHtml = `<span style="color:#16a34a; font-weight:700; font-size:0.85rem; display:inline-flex; align-items:center; margin-right:auto;">✓ Customer Checked In</span>`; } 
  else if (status === 'rejected') { const useStart = startSlotStr || booking.start_time; const useEnd = endSlotStr || booking.end_time; actionButtonsHtml = `<button type="button" class="btn" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:8px 14px; font-weight:700;" onclick="clearRejectedSlotToAvailable('${booking.id}')">🧹 Clear to Available</button><button type="button" class="btn btn-primary" style="padding:8px 16px; font-weight:700;" onclick="rebookOverRejectedSlot('${booking.id}', '${facility.id}', '${useStart}', '${useEnd}')">⚡ Book New Walk-in Here</button>`; }

  footer.innerHTML = `<button type="button" class="btn btn-secondary" onclick="closeModal('slotDetailModal')">Close</button>${actionButtonsHtml}`;
  modal.classList.add('active');
};

async function clearRejectedSlotToAvailable(bookingId) { addClearedRejectedSlotId(bookingId); closeModal('slotDetailModal'); await renderMultiCourtMatrix(); }
async function rebookOverRejectedSlot(bookingId, facilityId, startSlotStr, endSlotStr) { addClearedRejectedSlotId(bookingId); closeModal('slotDetailModal'); await openMatrixWalkInModal(facilityId, startSlotStr, endSlotStr); }

async function loadSlotModalAddonPicker(bookingId, facilityId, dateStr, startTimeStr) {
  const box = document.getElementById('slotModalAddonPickerBox'); if (!box) return;
  box.style.display = 'block'; box.innerHTML = '<div style="font-size:0.8rem; color:var(--text-secondary);">Checking equipment stock...</div>';
  slotModalAddonsCart = {}; const hourNum = parseInt(startTimeStr); slotModalEquipmentList = await getAvailableEquipmentForSlot(facilityId, dateStr, hourNum);
  if (slotModalEquipmentList.length === 0) { box.innerHTML = '<div style="font-size:0.8rem; color:var(--text-tertiary);">No add-on equipment available for this facility</div>'; return; }
  box.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto; margin-bottom:10px;">
      ${slotModalEquipmentList.map(eq => {
        const isOut = eq.availableStock <= 0;
        return `<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:8px 10px; border-radius:8px; border:1px solid #e2e8f0; opacity:${isOut ? '0.55' : '1'};"><div><div style="font-size:0.82rem; font-weight:700;">${eq.name} <span style="font-size:0.72rem; color:#0284c7;">(${translateEquipmentType(eq.type)})</span></div><div style="font-size:0.74rem; color:var(--text-secondary);">฿${eq.price} | Available: <strong>${eq.availableStock}</strong> pcs</div></div><div style="display:flex; align-items:center; gap:8px;"><button type="button" onclick="updateSlotModalAddonQty('${eq.id}', -1, ${eq.availableStock})" style="width:26px; height:26px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; font-weight:700; cursor:pointer;" ${isOut ? 'disabled' : ''}>-</button><span id="slotModalAddonQty_${eq.id}" style="min-width:18px; text-align:center; font-size:0.84rem; font-weight:800;">0</span><button type="button" onclick="updateSlotModalAddonQty('${eq.id}', 1, ${eq.availableStock})" style="width:26px; height:26px; border:none; background:var(--primary); color:#fff; border-radius:6px; font-weight:700; cursor:pointer;" ${isOut ? 'disabled' : ''}>+</button></div></div>`;
      }).join('')}
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center;"><span id="slotModalAddonTotalText" style="font-size:0.82rem; font-weight:700; color:#0369a1;">Added Total: +฿0</span><button type="button" class="btn btn-success" style="padding:6px 14px; font-size:0.78rem;" onclick="saveSlotModalAddonsToBooking('${bookingId}', '${facilityId}')">💾 Save Equipment to Bill</button></div>
  `;
}

function updateSlotModalAddonQty(eqId, delta, maxAvail) {
  const cur = slotModalAddonsCart[eqId] || 0, next = cur + delta;
  if (next < 0 || next > maxAvail) return;
  slotModalAddonsCart[eqId] = next;
  const qtyEl = document.getElementById(`slotModalAddonQty_${eqId}`); if (qtyEl) qtyEl.textContent = next;
  let sum = 0;
  for (const [id, q] of Object.entries(slotModalAddonsCart)) {
    if (q > 0) { const item = slotModalEquipmentList.find(e => String(e.id) === String(id)); if (item) sum += (Number(item.price || 0) * q); }
  }
  const sumEl = document.getElementById('slotModalAddonTotalText'); if (sumEl) sumEl.textContent = `Added Total: +฿${sum.toLocaleString()}`;
}

async function saveSlotModalAddonsToBooking(bookingId, facilityId) {
  const booking = (currentMatrixBookingsCache || []).find(b => String(b.id) === String(bookingId)); if (!booking) return;
  if (String(booking.payment_status || '').toLowerCase() === 'completed') { alert('This booking is already checked in; equipment cannot be added.'); return; }
  const newItems = []; let addedCost = 0;
  for (const [id, q] of Object.entries(slotModalAddonsCart)) {
    if (q > 0) {
      const eq = slotModalEquipmentList.find(e => String(e.id) === String(id));
      if (eq) { newItems.push({ id: eq.id, name: eq.name, type: eq.type, price: Number(eq.price || 0), qty: q }); addedCost += (Number(eq.price || 0) * q); }
    }
  }
  if (newItems.length === 0) { alert('Please select the quantity of equipment to add first.'); return; }
  let existingAddons = booking.addons; if (typeof existingAddons === 'string') { try { existingAddons = JSON.parse(existingAddons); } catch (e) { existingAddons = []; } }
  if (!Array.isArray(existingAddons)) existingAddons = [];
  const mergedAddons = [...existingAddons];
  newItems.forEach(ni => { const found = mergedAddons.find(ex => String(ex.id) === String(ni.id)); if (found) found.qty = Number(found.qty || 0) + ni.qty; else mergedAddons.push(ni); });
  const newTotalPrice = Number(booking.total_price || 0) + addedCost;
  try {
    const { error } = await supabaseClient.from('bookings').update({ addons: mergedAddons, total_price: newTotalPrice }).eq('id', booking.id);
    if (error) throw error;
    for (const ni of newItems) {
      if (isBuyType(ni.type)) { const { data: eqRow } = await supabaseClient.from('equipment').select('stock').eq('id', ni.id).single(); if (eqRow) { await supabaseClient.from('equipment').update({ stock: Math.max(0, Number(eqRow.stock || 0) - ni.qty) }).eq('id', ni.id); } }
    }
    alert(`✅ Equipment added successfully! (+฿${addedCost.toLocaleString()})`);
    await renderDashboardStats(); openMatrixSlotModal(booking.id, facilityId, booking.start_time, booking.end_time);
  } catch (err) { alert('Failed to save equipment: ' + err.message); }
}

openMatrixWalkInModal = async function(facilityId, startSlotStr, endSlotStr) {
  const facility = (FACILITIES || []).find(f => String(f.id) === String(facilityId)); if (!facility) return;
  const modal = document.getElementById('walkInModal'); if (!modal) return;
  const targetDateStr = formatYMD(currentMatrixDate);
  walkInBaseFacilityPrice = Number(facility.price || 0); walkInSelectedAddons = {};
  document.getElementById('walkInFacilityId').value = facility.id; document.getElementById('walkInDate').value = targetDateStr; document.getElementById('walkInStart').value = startSlotStr; document.getElementById('walkInEnd').value = endSlotStr; document.getElementById('walkInFacilityName').textContent = facility.name; document.getElementById('walkInTimeSlot').textContent = `${startSlotStr} - ${endSlotStr}`; document.getElementById('walkInDateStr').textContent = targetDateStr; document.getElementById('walkInPrice').value = walkInBaseFacilityPrice; document.getElementById('walkInCustomerName').value = ''; document.getElementById('walkInCustomerPhone').value = ''; document.getElementById('walkInPaymentMethod').value = 'cash'; document.getElementById('walkInCheckInStatus').value = 'completed';
  modal.classList.add('active');
  const addonsSec = document.getElementById('walkInAddonsSection'), addonsListEl = document.getElementById('walkInAddonsList'), badgeEl = document.getElementById('walkInAddonSummaryBadge');
  if (badgeEl) badgeEl.textContent = '+฿0';
  if (addonsSec && addonsListEl) {
    const hourNum = parseInt(startSlotStr); walkInEquipmentList = await getAvailableEquipmentForSlot(facility.id, targetDateStr, hourNum);
    if (walkInEquipmentList.length > 0) {
      addonsSec.style.display = 'block';
      addonsListEl.innerHTML = walkInEquipmentList.map(eq => {
        const isOut = eq.availableStock <= 0;
        return `<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; opacity:${isOut ? '0.55' : '1'};"><div><div style="font-size:0.84rem; font-weight:700;">${eq.name} <span style="font-size:0.72rem; color:#0284c7;">(${translateEquipmentType(eq.type)})</span></div><div style="font-size:0.75rem; color:var(--text-secondary);">฿${eq.price} | Available: <strong>${eq.availableStock}</strong> pcs</div></div><div style="display:flex; align-items:center; gap:8px;"><button type="button" onclick="updateWalkInAddonQty('${eq.id}', -1, ${eq.availableStock})" style="width:28px; height:28px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; font-weight:700; cursor:pointer;" ${isOut ? 'disabled' : ''}>-</button><span id="walkInQty_${eq.id}" style="min-width:18px; text-align:center; font-size:0.85rem; font-weight:800;">0</span><button type="button" onclick="updateWalkInAddonQty('${eq.id}', 1, ${eq.availableStock})" style="width:28px; height:28px; border:none; background:var(--primary); color:#fff; border-radius:6px; font-weight:700; cursor:pointer;" ${isOut ? 'disabled' : ''}>+</button></div></div>`;
      }).join('');
    } else { addonsSec.style.display = 'none'; }
  }
};

function updateWalkInAddonQty(eqId, delta, maxAvail) {
  const cur = walkInSelectedAddons[eqId] || 0, next = cur + delta;
  if (next < 0 || next > maxAvail) return;
  walkInSelectedAddons[eqId] = next;
  const qtyEl = document.getElementById(`walkInQty_${eqId}`); if (qtyEl) qtyEl.textContent = next;
  let addonSum = 0;
  for (const [id, q] of Object.entries(walkInSelectedAddons)) { if (q > 0) { const item = walkInEquipmentList.find(e => String(e.id) === String(id)); if (item) addonSum += (Number(item.price || 0) * q); } }
  const badgeEl = document.getElementById('walkInAddonSummaryBadge'); if (badgeEl) badgeEl.textContent = `+฿${addonSum.toLocaleString()}`;
  const priceInput = document.getElementById('walkInPrice'); if (priceInput) priceInput.value = walkInBaseFacilityPrice + addonSum;
}

handleWalkInSubmit = async function(event) {
  event.preventDefault();
  const facId = document.getElementById('walkInFacilityId').value, dateStr = document.getElementById('walkInDate').value, startStr = document.getElementById('walkInStart').value, endStr = document.getElementById('walkInEnd').value, custName = document.getElementById('walkInCustomerName').value.trim(), custPhone = document.getElementById('walkInCustomerPhone').value.trim(), price = Number(document.getElementById('walkInPrice').value) || 0, checkInStatus = document.getElementById('walkInCheckInStatus').value;
  if (!custName || !custPhone) { alert('Please enter the customer name and phone number.'); return; }

  const addonsToSave = [];
  for (const [id, q] of Object.entries(walkInSelectedAddons)) {
    if (q > 0) { const eq = walkInEquipmentList.find(e => String(e.id) === String(id)); if (eq) { addonsToSave.push({ id: eq.id, name: eq.name, type: eq.type, price: Number(eq.price || 0), qty: q }); } }
  }

  const submitBtn = document.getElementById('walkInSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

  try {
    const newBooking = { user_id: currentUser?.id || 'admin', facility_id: facId, date: dateStr, start_time: startStr, end_time: endStr, total_price: price, payment_status: checkInStatus, slip_url: 'walk-in', customer_name: custName, customer_phone: custPhone, addons: addonsToSave };
    const { error } = await supabaseClient.from('bookings').insert([newBooking]);
    if (error) throw error;
    for (const addon of addonsToSave) { if (isBuyType(addon.type)) { const { data: eqRow } = await supabaseClient.from('equipment').select('stock').eq('id', addon.id).single(); if (eqRow) { await supabaseClient.from('equipment').update({ stock: Math.max(0, Number(eqRow.stock || 0) - addon.qty) }).eq('id', addon.id); } } }
    closeModal('walkInModal'); alert('✅ Walk-in booking and add-on equipment saved successfully!'); await renderDashboardStats();
  } catch (err) { alert('Failed to save booking: ' + err.message); } finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '💾 Save Booking'; } }
};

// ============================================================================
// 🔧 Helper Functions & Shared State Variables
// ============================================================================

var groupedBookingsCache = {};
var currentFacilityEquipment = [];
var selectedAddons = {};
var currentPaymentFilter = 'pending';
var currentMatrixDate = new Date();
var currentMatrixTimeRange = 'evening';
var currentMatrixCourtFilter = 'all';
var currentMatrixBookingsCache = [];
var currentMatrixBlocksCache = [];

// 1. Dashboard & Matrix Date Formatting Helpers
function formatYMD(d) {
  if (!d) return '';
  const dateObj = (d instanceof Date) ? d : new Date(d);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatThaiDateDisplay(d) {
  if (!d) return '';
  const dateObj = (d instanceof Date) ? d : new Date(d);
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dateObj.getDate()} ${monthsEn[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

function handleReportPeriodChange() {
  const periodType = document.getElementById('dashReportPeriodType')?.value || 'monthly';
  const dailyWrap = document.getElementById('dashDailyPickerWrap');
  const monthWrap = document.getElementById('dashMonthPickerWrap');
  const yearWrap = document.getElementById('dashYearPickerWrap');
  const customStartWrap = document.getElementById('dashCustomStartWrap');
  const customEndWrap = document.getElementById('dashCustomEndWrap');

  if (dailyWrap) dailyWrap.style.display = (periodType === 'daily') ? 'block' : 'none';
  if (monthWrap) monthWrap.style.display = (periodType === 'monthly') ? 'block' : 'none';
  if (yearWrap) yearWrap.style.display = (periodType === 'monthly' || periodType === 'yearly') ? 'block' : 'none';
  if (customStartWrap) customStartWrap.style.display = (periodType === 'custom') ? 'block' : 'none';
  if (customEndWrap) customEndWrap.style.display = (periodType === 'custom') ? 'block' : 'none';

  if (periodType === 'daily') {
    const dailyInput = document.getElementById('dashRealtimeDate');
    if (dailyInput && !dailyInput.value) dailyInput.value = formatYMD(new Date());
  }
  renderDashboardStats();
}

function resetDashboardFilters() {
  if (document.getElementById('dashReportPeriodType')) document.getElementById('dashReportPeriodType').value = 'monthly';
  if (document.getElementById('dashFilterFacility')) document.getElementById('dashFilterFacility').value = 'all';
  if (document.getElementById('dashFilterStartDate')) document.getElementById('dashFilterStartDate').value = '';
  if (document.getElementById('dashFilterEndDate')) document.getElementById('dashFilterEndDate').value = '';
  handleReportPeriodChange();
}

function changeMatrixDate(delta) {
  const current = new Date(currentMatrixDate);
  current.setDate(current.getDate() + delta);
  currentMatrixDate = current;
  renderMultiCourtMatrix();
}

function setMatrixDateToday() {
  currentMatrixDate = new Date();
  renderMultiCourtMatrix();
}

function syncMatrixDate(val) {
  if (!val) return;
  const parts = val.split('-');
  if (parts.length === 3) {
    currentMatrixDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    renderMultiCourtMatrix();
  }
}

function setMatrixTimeRange(range, btn) {
  currentMatrixTimeRange = range;
  document.querySelectorAll('.timerange-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMultiCourtMatrix();
}

function handleMatrixCourtFilterChange(val) {
  currentMatrixCourtFilter = val;
  renderMultiCourtMatrix();
}

function getSportColor(sport) {
  const s = (sport || '').toLowerCase();
  if (s.includes('badminton')) return '#10b981';
  if (s.includes('futsal')) return '#3b82f6';
  if (s.includes('football')) return '#059669';
  if (s.includes('basket')) return '#f59e0b';
  if (s.includes('volley')) return '#ec4899';
  return '#10b981';
}

async function quickMatrixApprove(bookingId) {
  const { error } = await supabaseClient.from('bookings').update({ payment_status: 'approved' }).eq('id', bookingId);
  if (error) alert('Failed to approve booking: ' + error.message);
  else { closeModal('slotDetailModal'); await renderDashboardStats(); }
}

async function quickMatrixCheckIn(bookingId) {
  const { error } = await supabaseClient.from('bookings').update({ payment_status: 'completed' }).eq('id', bookingId);
  if (error) alert('Failed to check in: ' + error.message);
  else { closeModal('slotDetailModal'); await renderDashboardStats(); }
}

async function quickMatrixReject(bookingId) {
  if (!confirm('Are you sure you want to reject or cancel this booking slot?')) return;
  const { error } = await supabaseClient.from('bookings').update({ payment_status: 'rejected' }).eq('id', bookingId);
  if (error) alert('Failed to cancel booking: ' + error.message);
  else { closeModal('slotDetailModal'); await renderDashboardStats(); }
}

// 2. Slot Management View Functions
async function initSlotManagement() {
  if (!FACILITIES || FACILITIES.length === 0) await fetchFacilities('all');
  const myFacilities = getMyManagedFacilities();
  const facSelect = document.getElementById('slotManageFacility');
  const container = document.getElementById('adminDailyScheduleList');

  if (facSelect) {
    if (myFacilities.length === 0) {
      facSelect.innerHTML = '<option value="">-- No Managed Facilities --</option>';
      if (container) container.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:24px;">You do not have any managed sports facilities yet</p>';
      return;
    }
    const currentVal = facSelect.value;
    facSelect.innerHTML = myFacilities.map(f => `<option value="${f.id}">${f.name} (฿${f.price}/hr)</option>`).join('');
    if (currentVal && myFacilities.some(f => f.id === currentVal)) facSelect.value = currentVal;
  }

  const dateInput = document.getElementById('slotManageDate');
  if (dateInput && !dateInput.value) dateInput.value = formatYMD(new Date());

  ['walkinStartTime', 'blockStartTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length === 0) {
      let opts = '';
      for (let h = 6; h <= 21; h++) opts += `<option value="${String(h).padStart(2, '0')}:00">${String(h).padStart(2, '0')}:00</option>`;
      el.innerHTML = opts;
    }
  });

  ['walkinEndTime', 'blockEndTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length === 0) {
      let opts = '';
      for (let h = 7; h <= 22; h++) opts += `<option value="${String(h).padStart(2, '0')}:00">${String(h).padStart(2, '0')}:00</option>`;
      el.innerHTML = opts;
    }
  });

  await loadSlotManagementData();
}

async function loadSlotManagementData() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const container = document.getElementById('adminDailyScheduleList');
  if (!container || !facilityId || !dateStr) return;

  container.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:20px;">Loading schedule...</p>';

  const [bRes, tbRes] = await Promise.all([
    supabaseClient.from('bookings').select('*').eq('facility_id', facilityId).eq('date', dateStr).neq('payment_status', 'rejected'),
    supabaseClient.from('time_blocks').select('*').eq('facility_id', facilityId).eq('date', dateStr)
  ]);

  const bookings = bRes.data || [];
  const blocks = tbRes.data || [];
  groupBookingsIntoBills(bookings);

  let html = '';
  for (let h = 6; h <= 21; h++) {
    const slotStart = `${String(h).padStart(2, '0')}:00`;
    const slotEnd = `${String(h + 1).padStart(2, '0')}:00`;
    const matchedBooking = bookings.find(b => h >= parseInt(b.start_time) && h < parseInt(b.end_time));
    const matchedBlock = blocks.find(bl => h >= parseInt(bl.blocked_start) && h < parseInt(bl.blocked_end));

    if (matchedBooking) {
      const bookingId = String(matchedBooking.id);
      const statusLower = (matchedBooking.payment_status || 'pending').toLowerCase();
      let badgeColor = statusLower === 'approved' ? '#16a34a' : (statusLower === 'completed' ? '#2563eb' : '#eab308');
      let bgRow = statusLower === 'approved' ? '#f0fdf4' : (statusLower === 'completed' ? '#eff6ff' : '#fefce8');
      let actionBtnHtml = '';

      if (statusLower === 'approved') {
        actionBtnHtml += `<button class="btn" style="background:#22c55e; color:white; padding:5px 10px; font-size:0.74rem;" onclick="checkInSingleSlot('${bookingId}')">✅ Check In Hour</button>`;
      } else if (statusLower === 'pending') {
        actionBtnHtml += `<button class="btn" style="background:#eab308; color:white; padding:5px 10px; font-size:0.74rem;" onclick="switchView('payments')">Verify Slip</button>`;
      }
      if (statusLower !== 'completed') {
        actionBtnHtml += `<button class="btn" style="background:#ef4444; color:white; padding:5px 10px; font-size:0.74rem;" onclick="cancelSlotBooking('${bookingId}')">Cancel Slot</button>`;
      } else {
        actionBtnHtml += `<span style="font-size:0.78rem; color:#2563eb; font-weight:700;">✓ Checked In</span>`;
      }

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:${bgRow}; border:1px solid #cbd5e1; border-radius:8px; flex-wrap:wrap; gap:8px;">
          <div>
            <strong style="font-size:0.9rem;">⏰ ${slotStart} - ${slotEnd}</strong>
            <span style="margin-left:8px; font-size:0.72rem; font-weight:700; color:white; background:${badgeColor}; padding:2px 8px; border-radius:12px;">${statusLower.toUpperCase()}</span>
            <div style="font-size:0.82rem; color:#334155; margin-top:3px;">👤 <strong>${matchedBooking.customer_name || 'Customer'}</strong> | 📞 ${matchedBooking.customer_phone || '-'}</div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">${actionBtnHtml}</div>
        </div>`;
    } else if (matchedBlock) {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">
          <div>
            <strong style="font-size:0.9rem; color:#c2410c;">🔒 ${slotStart} - ${slotEnd} (Blocked)</strong>
            <div style="font-size:0.8rem; color:#9a3412;">Reason: ${translateBlockReason(matchedBlock.reason || 'Maintenance')}</div>
          </div>
          <button class="btn" style="background:#f97316; color:white; padding:5px 10px; font-size:0.75rem;" onclick="removeTimeBlock('${matchedBlock.id}')">Unblock</button>
        </div>`;
    } else {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:var(--bg); border:1px dashed var(--border); border-radius:8px;">
          <div><span style="font-size:0.88rem; font-weight:600; color:var(--text-secondary);">🟢 ${slotStart} - ${slotEnd}</span><span style="font-size:0.8rem; color:var(--success); margin-left:8px;">Available</span></div>
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.75rem;" onclick="quickFillWalkinTime('${slotStart}', '${slotEnd}')">Select Slot</button>
        </div>`;
    }
  }
  container.innerHTML = html;
}

function quickFillWalkinTime(start, end) {
  if (document.getElementById('walkinStartTime')) document.getElementById('walkinStartTime').value = start;
  if (document.getElementById('walkinEndTime')) document.getElementById('walkinEndTime').value = end;
  if (document.getElementById('blockStartTime')) document.getElementById('blockStartTime').value = start;
  if (document.getElementById('blockEndTime')) document.getElementById('blockEndTime').value = end;
  if (document.getElementById('walkinCustomerName')) document.getElementById('walkinCustomerName').focus();
}

async function cancelSlotBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this hour slot so it becomes available again?')) return;
  const { error } = await supabaseClient.from('bookings').update({ payment_status: 'rejected' }).eq('id', String(bookingId).trim());
  if (error) alert('Error: ' + error.message); else await loadSlotManagementData();
}

async function submitAdminWalkinBooking() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const customerName = document.getElementById('walkinCustomerName')?.value.trim();
  const customerPhone = document.getElementById('walkinCustomerPhone')?.value.trim();
  const startStr = document.getElementById('walkinStartTime')?.value;
  const endStr = document.getElementById('walkinEndTime')?.value;

  if (!customerName || !customerPhone) { alert('Please enter the customer name and phone number.'); return; }
  const startHour = parseInt(startStr), endHour = parseInt(endStr);
  if (endHour <= startHour) { alert('End time must be later than start time.'); return; }

  const facility = FACILITIES.find(f => f.id === facilityId);
  const pricePerHour = facility?.price || 0;
  const batchMarker = 'walkin_' + Date.now();
  const inserts = [];
  for (let h = startHour; h < endHour; h++) {
    inserts.push({
      user_id: currentUser?.id || 'admin', facility_id: facilityId, date: dateStr,
      start_time: `${String(h).padStart(2, '0')}:00`, end_time: `${String(h + 1).padStart(2, '0')}:00`,
      total_price: pricePerHour, payment_status: 'approved', slip_url: batchMarker,
      customer_name: customerName, customer_phone: customerPhone
    });
  }
  const { error } = await supabaseClient.from('bookings').insert(inserts);
  if (error) alert('Failed to save booking: ' + error.message);
  else {
    alert(`✅ Booking recorded for "${customerName}" (${startStr} - ${endStr})!`);
    document.getElementById('walkinCustomerName').value = '';
    document.getElementById('walkinCustomerPhone').value = '';
    await loadSlotManagementData();
  }
}

async function submitTimeBlock() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const startStr = document.getElementById('blockStartTime')?.value;
  const endStr = document.getElementById('blockEndTime')?.value;
  const reason = document.getElementById('blockReason')?.value;
  if (parseInt(endStr) <= parseInt(startStr)) { alert('End time must be later than start time.'); return; }
  const { error } = await supabaseClient.from('time_blocks').insert([{ facility_id: facilityId, date: dateStr, blocked_start: startStr, blocked_end: endStr, reason: reason }]);
  if (error) alert('Failed to block time slot: ' + error.message);
  else { alert(`🔒 Blocked court time slot ${startStr} - ${endStr} successfully!`); await loadSlotManagementData(); }
}

async function removeTimeBlock(blockId) {
  if (!confirm('Are you sure you want to unblock this time slot?')) return;
  const { error } = await supabaseClient.from('time_blocks').delete().eq('id', String(blockId).trim());
  if (error) alert('Failed to unblock time slot: ' + error.message); else await loadSlotManagementData();
}

// 3. E-Ticket Modal, Profile, and Facility Image Preview Functions
function openBookingTicketModal(groupId, isAdminView = false) {
  const bill = groupedBookingsCache[groupId]; if (!bill) return;
  const facility = FACILITIES.find(f => String(f.id) === String(bill.facility_id)) || { name: 'Sports Facility' };
  const statusLower = (bill.payment_status || 'pending').toLowerCase();
  // Strict RBAC: Only Facility Owners and Staff can execute check-ins; Admin views tickets in Read-Only Audit Mode
  const canManage = ((currentRole === 'owner' || currentRole === 'staff') && isAdminView);

  const badge = document.getElementById('ticketStatusBadge');
  if (badge) badge.textContent = bill.isPartiallyCheckedIn ? `CHECKED-IN ${bill.completedCount}/${bill.totalSlots}` : statusLower.toUpperCase();

  const slotsListHtml = bill.slots.map((s, idx) => {
    let slotStatusHtml = '';
    if (s.status === 'completed') slotStatusHtml = `<span style="background:#dbeafe; color:#1d4ed8; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">✓ Checked In</span>`;
    else if (s.status === 'approved') {
      slotStatusHtml = canManage
        ? `<button class="btn" style="background:#22c55e; color:white; padding:3px 8px; font-size:0.72rem; border-radius:6px;" onclick="checkInSingleSlot('${s.id}', '${bill.groupId}')">✅ Check In Slot</button>`
        : `<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">⏳ Awaiting Check-in</span>`;
    } else slotStatusHtml = `<span style="background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">Pending Slip Review</span>`;

    return `<div style="display:flex; justify-content:space-between; padding:8px 12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px; font-size:0.85rem;"><div><span style="color:var(--text-secondary); font-size:0.78rem;">Slot ${idx + 1}:</span><strong style="margin-left:4px;">${s.start} - ${s.end}</strong></div>${slotStatusHtml}</div>`;
  }).join('');

  let addonsArr = bill.addons;
  if (typeof addonsArr === 'string') { try { addonsArr = JSON.parse(addonsArr); } catch (e) { addonsArr = []; } }
  let addonsHtml = '';
  if (Array.isArray(addonsArr) && addonsArr.length > 0) {
    addonsHtml = `<div style="background:#fffbeb; padding:12px; border-radius:10px; border:1px solid #fde68a; margin-bottom:16px;"><h4 style="font-size:0.85rem; font-weight:600; color:#b45309; margin:0 0 8px 0;">📦 Selected Add-on Equipment</h4>${addonsArr.map(a => `<div style="display:flex; justify-content:space-between; font-size:0.85rem; border-bottom:1px dashed #fcd34d; padding:4px 0;"><span style="color:#92400e;">${a.name} (${translateEquipmentType(a.type)}) <strong>x${a.qty}</strong></span><span style="font-weight:700; color:#b45309;">฿${(a.price * a.qty).toLocaleString()}</span></div>`).join('')}</div>`;
  }

  const body = document.getElementById('bookingTicketBody');
  if (body) {
    body.innerHTML = `
      <div style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px dashed #cbd5e1;"><div style="font-size:0.78rem; color:var(--text-tertiary);">Booking Reference</div><div style="font-size:0.9rem; font-weight:700;">#${bill.groupId}</div></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">Facility</div><div style="font-size:0.95rem; font-weight:700;">${facility.name}</div></div>
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">Booking Date</div><div style="font-size:0.95rem; font-weight:700;">${bill.date}</div></div>
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">Customer Name</div><div style="font-size:0.92rem; font-weight:600;">${bill.customer_name}</div></div>
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">Phone Number</div><div style="font-size:0.92rem; font-weight:600;">${bill.customer_phone}</div></div>
      </div>
      ${addonsHtml}
      <div style="background:#f8fafc; padding:12px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:16px;"><div style="margin-bottom:8px;"><span style="font-size:0.82rem; font-weight:600;">Booked Time Slots</span></div>${slotsListHtml}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:2px solid #f1f5f9; margin-top:14px;"><span style="font-size:0.95rem; font-weight:600;">Grand Total</span><span style="font-size:1.35rem; font-weight:800; color:var(--primary);">฿${bill.total_price.toLocaleString()}</span></div>
    `;
  }

  const footer = document.getElementById('bookingTicketFooter');
  if (footer) {
    const remainingSlots = bill.slots.filter(s => s.status === 'approved').length;
    const adminActions = (canManage && remainingSlots > 0) ? `<button class="btn" style="flex:1.5; background:#2563eb; color:white;" onclick="confirmGroupCheckIn('${bill.groupId}')">✅ Check In All Slots</button>` : '';
    footer.innerHTML = `<button class="btn btn-secondary" style="flex:1;" onclick="closeModal('bookingTicketModal')">Close</button>${adminActions}`;
  }
  document.getElementById('bookingTicketModal').classList.add('active');
}

function handleFacilityImagesSelect(event) {
  const files = Array.from(event.target.files);
  if (selectedFacilityImages.length + files.length > 4) { alert('You can upload up to 4 images maximum.'); return; }
  files.forEach(file => { if (file.size <= 5 * 1024 * 1024) selectedFacilityImages.push(file); });
  event.target.value = '';
  renderFacilityImagePreview();
}

function renderFacilityImagePreview() {
  const previewList = document.getElementById('facilityImagePreviewList');
  const uploadBox = document.getElementById('facilityImageUploadBox');
  if (!previewList || !uploadBox) return;
  previewList.innerHTML = '';
  selectedFacilityImages.forEach((file, index) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative; display:inline-block;';
    const img = document.createElement('img');
    img.style.cssText = 'width:80px; height:80px; object-fit:cover; border-radius:6px; border:2px solid var(--border-light);';
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);
    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '×';
    removeBtn.style.cssText = 'position:absolute; top:-6px; right:-6px; background:var(--error); color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer;';
    removeBtn.onclick = e => { e.stopPropagation(); selectedFacilityImages.splice(index, 1); renderFacilityImagePreview(); };
    wrapper.appendChild(img); wrapper.appendChild(removeBtn); previewList.appendChild(wrapper);
  });
  uploadBox.style.display = selectedFacilityImages.length >= 4 ? 'none' : 'block';
}

function toggleMobileNav() {
  const sidebar = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('mobileNavToggleBtn');
  const toggleText = document.getElementById('mobileNavToggleText');
  if (!sidebar || !toggleBtn) return;
  const isCollapsed = sidebar.classList.toggle('nav-collapsed');
  toggleBtn.classList.toggle('nav-collapsed', isCollapsed);
  if (toggleText) toggleText.textContent = isCollapsed ? '▲ Show Menu' : '▼ Hide Menu';
}

async function loadUserProfileView() {
  if (!currentUser) return;
  const { data: prof } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (prof) currentUser.profile = prof;
  const name = currentUser?.profile?.name || '', phone = currentUser?.profile?.phone || '', email = currentUser?.email || '';
  const initials = (name || email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  applyAvatar(document.getElementById('profilePageAvatar'), currentUser?.profile?.avatar_url, initials);
  if (document.getElementById('profileAvatarRemoveBtn')) document.getElementById('profileAvatarRemoveBtn').style.display = currentUser?.profile?.avatar_url ? 'inline-block' : 'none';
  if (document.getElementById('profilePageNameDisplay')) document.getElementById('profilePageNameDisplay').textContent = name || 'User';
  if (document.getElementById('profilePageEmailDisplay')) document.getElementById('profilePageEmailDisplay').textContent = email;
  if (document.getElementById('profileEditName')) document.getElementById('profileEditName').value = name;
  if (document.getElementById('profileEditPhone')) document.getElementById('profileEditPhone').value = phone;
  if (document.getElementById('profileEditEmail')) document.getElementById('profileEditEmail').value = email;
}

async function saveProfileInfo() {
  if (!currentUser) return;
  const newName = document.getElementById('profileEditName')?.value.trim();
  const newPhone = document.getElementById('profileEditPhone')?.value.trim();
  if (!newName) { alert('Please enter your full name.'); return; }
  const { error } = await supabaseClient.from('profiles').update({ name: newName, phone: newPhone }).eq('id', currentUser.id);
  if (error) alert('Error: ' + error.message);
  else { currentUser.profile = { ...(currentUser.profile || {}), name: newName, phone: newPhone }; setupNav(); await loadUserProfileView(); alert('✅ Profile information saved successfully!'); }
}

async function changeUserPassword() {
  if (!currentUser || !currentUser.email) return;
  const oldPass = document.getElementById('profileOldPassword')?.value.trim();
  const newPass = document.getElementById('profileNewPassword')?.value.trim();
  const confirmPass = document.getElementById('profileConfirmPassword')?.value.trim();
  if (!oldPass || !newPass || newPass.length < 6 || newPass !== confirmPass) { alert('Please check that your passwords are valid and match.'); return; }
  const { error: vErr } = await supabaseClient.auth.signInWithPassword({ email: currentUser.email, password: oldPass });
  if (vErr) { alert('Current password is incorrect.'); return; }
  const { error: uErr } = await supabaseClient.auth.updateUser({ password: newPass });
  if (uErr) alert('Failed to update password: ' + uErr.message);
  else {
    document.getElementById('profileOldPassword').value = '';
    document.getElementById('profileNewPassword').value = '';
    document.getElementById('profileConfirmPassword').value = '';
    alert('✅ Password updated successfully!');
  }
}
// ============ REPORT ISSUE ============
// Show floating button for user and owner roles
function updateReportFabVisibility() {
  const fab = document.getElementById('reportIssueFab');
  if (!fab) return;
  const show = (currentRole === 'user' || currentRole === 'owner');
  fab.style.display = show ? 'flex' : 'none';
}
const ISSUE_BUCKET = 'issue-images';
let reportImageFile = null;

function openReportIssueModal() {
  if (!currentUser) { alert('Please sign in before reporting an issue.'); return; }
  const backdrop = document.getElementById('reportModalBackdrop');
  if (backdrop) backdrop.classList.add('active');
}

function closeReportIssueModal() {
  const backdrop = document.getElementById('reportModalBackdrop');
  if (backdrop) backdrop.classList.remove('active');
  resetReportIssueForm();
}

function resetReportIssueForm() {
  reportImageFile = null;
  const cat = document.getElementById('reportCategory'); if (cat) cat.value = 'booking';
  const desc = document.getElementById('reportDescription'); if (desc) desc.value = '';
  const cnt = document.getElementById('reportDescCount'); if (cnt) cnt.textContent = '0';
  clearReportImage();
}

function handleReportImageSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image size exceeds 5MB. Please choose a smaller file.'); event.target.value = ''; return; }
  reportImageFile = file;
  const box = document.getElementById('reportUploadBox');
  const preview = document.getElementById('reportImagePreview');
  const inner = document.getElementById('reportUploadInner');
  const removeBtn = document.getElementById('reportImageRemove');
  if (preview) { preview.src = URL.createObjectURL(file); preview.style.display = 'block'; }
  if (inner) inner.style.display = 'none';
  if (removeBtn) removeBtn.style.display = 'inline-block';
  if (box) box.classList.add('has-image');
}

function clearReportImage() {
  reportImageFile = null;
  const input = document.getElementById('reportImageInput'); if (input) input.value = '';
  const preview = document.getElementById('reportImagePreview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  const inner = document.getElementById('reportUploadInner'); if (inner) inner.style.display = 'flex';
  const removeBtn = document.getElementById('reportImageRemove'); if (removeBtn) removeBtn.style.display = 'none';
  const box = document.getElementById('reportUploadBox'); if (box) box.classList.remove('has-image');
}

async function uploadReportImage(userId) {
  if (!reportImageFile) return null;
  const rawExt = (reportImageFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `${userId}_${Date.now()}.${rawExt || 'jpg'}`;
  const filePath = `reports/${fileName}`;
  const { error } = await supabaseClient.storage.from(ISSUE_BUCKET).upload(filePath, reportImageFile, {
    upsert: true,
    contentType: reportImageFile.type || 'image/jpeg'
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(ISSUE_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

const REPORT_CATEGORY_LABELS = { booking: 'Court / Time Slot Booking', payment: 'Payment / Transfer Slip', bug: 'Website Bug', other: 'Other' };

async function submitReportIssue() {
  if (!currentUser) { alert('Please sign in before reporting an issue.'); return; }
  const category = document.getElementById('reportCategory')?.value || 'other';
  const description = document.getElementById('reportDescription')?.value.trim() || '';
  if (!description) { alert('Please enter an issue description.'); return; }

  const submitBtn = document.getElementById('reportSubmitBtn');
  const submitText = document.getElementById('reportSubmitText');
  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.textContent = 'Submitting...';

  try {
    // 1) Upload screenshot if attached
    let imageUrl = null;
    try { imageUrl = await uploadReportImage(currentUser.id); }
    catch (e) { console.warn('Report image upload failed:', e.message); }

    // 2) Insert into issue_reports table
    const { error: insertErr } = await supabaseClient.from('issue_reports').insert([{
      user_id: currentUser.id,
      category: category,
      description: description,
      image_url: imageUrl,
      status: 'pending'
    }]);
    if (insertErr) throw insertErr;

    // 3) Admins view this report via the notification bell and "Issue Reports" tab

    closeReportIssueModal();
    alert('✅ Issue report submitted successfully! Thank you for your feedback; our team will review it shortly.');
  } catch (err) {
    console.error('Submit report error:', err);
    alert('Failed to submit report: ' + (err.message || 'An error occurred'));
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = 'Submit Report';
  }
}

// Character counter for report textarea
document.addEventListener('DOMContentLoaded', () => {
  const desc = document.getElementById('reportDescription');
  if (desc) desc.addEventListener('input', () => {
    const cnt = document.getElementById('reportDescCount');
    if (cnt) cnt.textContent = String(desc.value.length);
  });
  // Press Esc to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeReportIssueModal();
  });
});
