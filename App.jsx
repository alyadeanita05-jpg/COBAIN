import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, BookOpen, CheckSquare, Calendar as CalendarIcon,
  Activity, Users, Bell, Settings, Plus, Search, ChevronRight,
  Clock, AlertCircle, CheckCircle2, Circle, Edit3, Trash2,
  Send, MessageSquare, RotateCcw, Copy, ExternalLink, LogOut,
  UserPlus, Shield, Link as LinkIcon, FileText, ArrowLeft,
  ChevronLeft, Sparkles, Filter, X, Check
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  signOut, updateProfile
} from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, addDoc, updateDoc,
  deleteDoc, onSnapshot, query, where, getDocs, arrayUnion
} from 'firebase/firestore';

// ============================================================================
// KONFIGURASI FIREBASE MENGGUNAKAN ENVIRONMENT VARIABLES VITE
// ============================================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== 'your_api_key_here'
);

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = import.meta.env.VITE_APP_COLLECTION_ID || 'capstone-tracker-prod';

// ============================================================================
// HELPER & CONSTANTS
// ============================================================================
const STATUS_OPTIONS = [
  { label: 'Belum Dikerjakan', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { label: 'Sedang Dikerjakan', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Menunggu Review', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { label: 'Perlu Revisi', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { label: 'Selesai', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

const PRIORITY_OPTIONS = [
  { label: 'Rendah', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { label: 'Sedang', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Tinggi', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const COURSE_COLORS = [
  '#F43F5E', '#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B'
];

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (isoStr) => {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
};

const getInitials = (name) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

// ============================================================================
// MAIN APPLICATION
// ============================================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);

  // Navigation & View States
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Group Data Collections
  const [courses, setCourses] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Toast Notification
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Auth Listener
  useEffect(() => {
    if (!auth || !db) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid);
        const unsubUser = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            setUserProfile({ id: snap.id, ...snap.data() });
          } else {
            const defaultProf = {
              name: u.displayName || u.email?.split('@')[0] || 'Mahasiswa',
              email: u.email || 'mahasiswa@capstone.id',
              groupId: null,
              avatarColor: '#EC4899'
            };
            setDoc(userRef, defaultProf);
            setUserProfile({ id: u.uid, ...defaultProf });
          }
          setAuthLoading(false);
        });
        return () => unsubUser();
      } else {
        setUserProfile(null);
        setActiveGroup(null);
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Group Listener
  useEffect(() => {
    if (!db || !userProfile?.groupId) {
      setActiveGroup(null);
      return;
    }
    const groupRef = doc(db, 'artifacts', appId, 'public', 'data', 'groups', userProfile.groupId);
    const unsub = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        setActiveGroup({ id: snap.id, ...snap.data() });
      } else {
        setActiveGroup(null);
      }
    });
    return () => unsub();
  }, [userProfile?.groupId]);

  // Real-time Group Sub-collections Listener
  useEffect(() => {
    if (!db || !activeGroup?.id) return;
    const gId = activeGroup.id;
    const base = ['artifacts', appId, 'public', 'data'];

    const unsubCourses = onSnapshot(
      query(collection(db, ...base, 'courses'), where('groupId', '==', gId)),
      (snap) => setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubWeeks = onSnapshot(
      query(collection(db, ...base, 'weeks'), where('groupId', '==', gId)),
      (snap) => setWeeks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)))
    );
    const unsubTasks = onSnapshot(
      query(collection(db, ...base, 'tasks'), where('groupId', '==', gId)),
      (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubRevs = onSnapshot(
      query(collection(db, ...base, 'revisions'), where('groupId', '==', gId)),
      (snap) => setRevisions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubActs = onSnapshot(
      query(collection(db, ...base, 'activities'), where('groupId', '==', gId)),
      (snap) => setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    );
    const unsubNotifs = onSnapshot(
      query(collection(db, ...base, 'notifications'), where('groupId', '==', gId)),
      (snap) => setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    );

    return () => {
      unsubCourses(); unsubWeeks(); unsubTasks();
      unsubRevs(); unsubActs(); unsubNotifs();
    };
  }, [activeGroup?.id]);

  // Helper: Log Activity & Notification
  const logEvent = async (actionText, notifTitle = null) => {
    if (!db || !activeGroup?.id || !userProfile) return;
    const now = new Date().toISOString();
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'activities'), {
      groupId: activeGroup.id,
      userId: user.uid,
      userName: userProfile.name,
      action: actionText,
      createdAt: now
    });
    if (notifTitle) {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
        groupId: activeGroup.id,
        title: notifTitle,
        message: `${userProfile.name} ${actionText}`,
        readBy: [user.uid],
        createdAt: now
      });
    }
  };

  // Automatic Progress Calculations
  const calculateTaskProgress = (task) => {
    const mp = task.memberProgress || {};
    const memberIds = Object.keys(mp);
    if (memberIds.length === 0) {
      return task.status === 'Selesai' ? 100 : 0;
    }
    let totalItems = 0;
    let doneItems = 0;
    memberIds.forEach(uid => {
      const items = mp[uid]?.checklist || [];
      totalItems += items.length;
      doneItems += items.filter(i => i.done).length;
    });
    if (totalItems === 0) {
      const avgManual = memberIds.reduce((acc, uid) => acc + (mp[uid]?.manualProgress || 0), 0) / memberIds.length;
      return Math.round(avgManual);
    }
    return Math.round((doneItems / totalItems) * 100);
  };

  const calculateCourseProgress = (courseId) => {
    const cTasks = tasks.filter(t => t.courseId === courseId);
    if (cTasks.length === 0) return 0;
    const sum = cTasks.reduce((acc, t) => acc + calculateTaskProgress(t), 0);
    return Math.round(sum / cTasks.length);
  };

  const overallProgress = useMemo(() => {
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((acc, t) => acc + calculateTaskProgress(t), 0);
    return Math.round(sum / tasks.length);
  }, [tasks]);

  const currentMemberRole = useMemo(() => {
    if (!activeGroup || !user) return 'Anggota';
    const m = (activeGroup.members || []).find(m => m.uid === user.uid);
    return m?.role || 'Anggota';
  }, [activeGroup, user]);

  // Warning if Firebase Env Vars are missing
  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-pink-50/50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-pink-100 p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">Konfigurasi Firebase Belum Diisi</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Environment variables Firebase (<code className="text-pink-600 font-mono text-xs">VITE_FIREBASE_API_KEY</code> dan lainnya) belum terdeteksi.
          </p>
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 text-xs font-mono space-y-1 overflow-x-auto">
            <p>VITE_FIREBASE_API_KEY=...</p>
            <p>VITE_FIREBASE_AUTH_DOMAIN=...</p>
            <p>VITE_FIREBASE_PROJECT_ID=...</p>
            <p>VITE_FIREBASE_STORAGE_BUCKET=...</p>
            <p>VITE_FIREBASE_MESSAGING_SENDER_ID=...</p>
            <p>VITE_FIREBASE_APP_ID=...</p>
          </div>
          <p className="text-xs text-slate-500">
            Tambahkan variabel tersebut pada file <b>.env</b> (lokal) atau pada menu <b>Settings → Environment Variables</b> di dashboard Vercel, lalu lakukan Redeploy.
          </p>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50/40">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-medium text-slate-600">Memuat Capstone Tracker...</p>
        </div>
      </div>
    );
  }

  // 1. AUTH SCREEN
  if (!user) {
    return <AuthScreen showToast={showToast} toast={toast} />;
  }

  // 2. GROUP ONBOARDING SCREEN
  if (!activeGroup) {
    return (
      <GroupOnboarding
        user={user}
        userProfile={userProfile}
        showToast={showToast}
        toast={toast}
        onLogout={() => signOut(auth)}
      />
    );
  }

  const unreadNotifsCount = notifications.filter(n => !(n.readBy || []).includes(user.uid)).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'courses', label: 'Mata Kuliah', icon: BookOpen },
    { id: 'tasks', label: 'Semua Tugas', icon: CheckSquare },
    { id: 'calendar', label: 'Kalender', icon: CalendarIcon },
    { id: 'activity', label: 'Aktivitas', icon: Activity },
    { id: 'members', label: 'Anggota Kelompok', icon: Users },
    { id: 'notifications', label: 'Notifikasi', icon: Bell, badge: unreadNotifsCount },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  const handleNavigate = (tabId) => {
    setActiveTab(tabId);
    setSelectedCourseId(null);
    setSelectedTaskId(null);
    setSelectedMemberId(null);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
          toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'
        }`}>
          <Sparkles className="w-4 h-4 text-pink-400" />
          {toast.msg}
        </div>
      )}

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200/80 flex flex-col transition-transform duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-bold shadow-sm">
              CT
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">Capstone Tracker</h1>
              <p className="text-[11px] text-pink-600 font-medium truncate max-w-[140px]">{activeGroup.name}</p>
            </div>
          </div>
          <button className="lg:hidden text-slate-400" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-pink-50 text-pink-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-pink-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-bold bg-pink-500 text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-pink-50/50 border border-pink-100">
            <div className="w-9 h-9 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {getInitials(userProfile?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate">{userProfile?.name}</p>
              <p className="text-[11px] text-pink-600 font-medium">{currentMemberRole}</p>
            </div>
            <button
              onClick={() => signOut(auth)}
              title="Keluar"
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="bg-white border-b border-slate-200/80 px-5 py-3.5 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-600"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Halo, {userProfile?.name?.split(' ')[0]}! 👋
              </h2>
              <p className="text-xs text-slate-500">
                {activeGroup.name} • {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleNavigate('notifications')}
              className="relative p-2 rounded-xl border border-slate-200 hover:bg-pink-50 hover:border-pink-200 transition-colors"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-pink-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotifsCount}
                </span>
              )}
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white font-bold text-xs flex items-center justify-center shadow-sm">
              {getInitials(userProfile?.name)}
            </div>
          </div>
        </header>

        {/* WORKSPACE VIEWS */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {selectedTaskId ? (
            <TaskDetailView
              task={tasks.find(t => t.id === selectedTaskId)}
              course={courses.find(c => c.id === tasks.find(t => t.id === selectedTaskId)?.courseId)}
              week={weeks.find(w => w.id === tasks.find(t => t.id === selectedTaskId)?.weekId)}
              group={activeGroup}
              user={user}
              userProfile={userProfile}
              revisions={revisions.filter(r => r.taskId === selectedTaskId)}
              onBack={() => setSelectedTaskId(null)}
              calculateTaskProgress={calculateTaskProgress}
              logEvent={logEvent}
              showToast={showToast}
            />
          ) : selectedCourseId ? (
            <CourseDetailView
              course={courses.find(c => c.id === selectedCourseId)}
              weeks={weeks.filter(w => w.courseId === selectedCourseId)}
              tasks={tasks.filter(t => t.courseId === selectedCourseId)}
              group={activeGroup}
              onBack={() => setSelectedCourseId(null)}
              onOpenTask={(tId) => setSelectedTaskId(tId)}
              calculateTaskProgress={calculateTaskProgress}
              calculateCourseProgress={calculateCourseProgress}
              logEvent={logEvent}
              showToast={showToast}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  courses={courses}
                  tasks={tasks}
                  activities={activities}
                  overallProgress={overallProgress}
                  calculateCourseProgress={calculateCourseProgress}
                  calculateTaskProgress={calculateTaskProgress}
                  onOpenCourse={(cId) => { setSelectedCourseId(cId); }}
                  onOpenTask={(tId) => { setSelectedTaskId(tId); }}
                  onGoCourses={() => setActiveTab('courses')}
                />
              )}
              {activeTab === 'courses' && (
                <CoursesView
                  courses={courses}
                  tasks={tasks}
                  group={activeGroup}
                  calculateCourseProgress={calculateCourseProgress}
                  onOpenCourse={(cId) => setSelectedCourseId(cId)}
                  logEvent={logEvent}
                  showToast={showToast}
                />
              )}
              {activeTab === 'tasks' && (
                <AllTasksView
                  courses={courses}
                  weeks={weeks}
                  tasks={tasks}
                  group={activeGroup}
                  calculateTaskProgress={calculateTaskProgress}
                  onOpenTask={(tId) => setSelectedTaskId(tId)}
                  logEvent={logEvent}
                  showToast={showToast}
                />
              )}
              {activeTab === 'calendar' && (
                <CalendarView
                  courses={courses}
                  tasks={tasks}
                  onOpenTask={(tId) => setSelectedTaskId(tId)}
                />
              )}
              {activeTab === 'activity' && (
                <ActivityView activities={activities} />
              )}
              {activeTab === 'members' && (
                <MembersView
                  group={activeGroup}
                  courses={courses}
                  tasks={tasks}
                  selectedMemberId={selectedMemberId}
                  setSelectedMemberId={setSelectedMemberId}
                  calculateTaskProgress={calculateTaskProgress}
                  onOpenTask={(tId) => setSelectedTaskId(tId)}
                  showToast={showToast}
                />
              )}
              {activeTab === 'notifications' && (
                <NotificationsView
                  notifications={notifications}
                  user={user}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsView
                  user={user}
                  userProfile={userProfile}
                  group={activeGroup}
                  currentMemberRole={currentMemberRole}
                  showToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// 1. AUTH SCREEN
// ============================================================================
function AuthScreen({ showToast, toast }) {
  const [mode, setMode] = useState('login'); // login | register | reset
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Berhasil masuk ke Capstone Tracker!');
      } else if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', cred.user.uid), {
          name,
          email,
          groupId: null,
          avatarColor: '#EC4899'
        });
        showToast('Akun berhasil dibuat!');
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        showToast('Link reset password telah dikirim ke email kamu.');
        setMode('login');
      }
    } catch (err) {
      showToast(err.message || 'Terjadi kesalahan autentikasi.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 flex items-center justify-center p-4">
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm shadow-lg">
          {toast.msg}
        </div>
      )}
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-pink-100/60 border border-pink-100 p-8">
        <div className="text-center mb-7">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-3 shadow-md">
            CT
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Capstone Tracker</h1>
          <p className="text-xs text-slate-500 mt-1">Organize Your Tasks, Track Your Progress, Achieve Together.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Contoh: Alya Deanita"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-pink-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Mahasiswa</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nama@student.ac.id"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-pink-500"
            />
          </div>
          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-pink-500"
              />
            </div>
          )}

          {mode === 'login' && (
            <div className="flex justify-end">
              <button type="button" onClick={() => setMode('reset')} className="text-xs text-pink-600 hover:underline">
                Lupa password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-semibold text-sm transition-colors shadow-sm"
          >
            {loading ? 'Memproses...' : mode === 'login' ? 'Masuk ke Workspace' : mode === 'register' ? 'Daftar Akun' : 'Kirim Link Reset'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center space-y-3">
          {mode === 'login' ? (
            <p className="text-xs text-slate-600">
              Belum punya akun?{' '}
              <button onClick={() => setMode('register')} className="text-pink-600 font-bold hover:underline">
                Registrasi Sekarang
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              Sudah punya akun?{' '}
              <button onClick={() => setMode('login')} className="text-pink-600 font-bold hover:underline">
                Masuk
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. GROUP ONBOARDING SCREEN
// ============================================================================
function GroupOnboarding({ user, userProfile, showToast, toast, onLogout }) {
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) setInviteCode(code.toUpperCase());
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setLoading(true);
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const groupRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'groups'), {
        name: groupName.trim(),
        inviteCode: code,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        members: [{
          uid: user.uid,
          name: userProfile?.name || 'Ketua',
          email: userProfile?.email || '',
          role: 'Ketua Kelompok'
        }]
      });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), {
        groupId: groupRef.id
      });
      showToast(`Kelompok "${groupName}" berhasil dibuat!`);
    } catch (err) {
      showToast('Gagal membuat kelompok.', 'error');
    }
    setLoading(false);
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'groups'),
        where('inviteCode', '==', inviteCode.trim().toUpperCase())
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        showToast('Kode undangan tidak ditemukan!', 'error');
        setLoading(false);
        return;
      }
      const gDoc = snap.docs[0];
      const gData = gDoc.data();
      const already = (gData.members || []).some(m => m.uid === user.uid);
      if (!already) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'groups', gDoc.id), {
          members: arrayUnion({
            uid: user.uid,
            name: userProfile?.name || 'Anggota',
            email: userProfile?.email || '',
            role: 'Anggota'
          })
        });
      }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), {
        groupId: gDoc.id
      });
      showToast(`Berhasil bergabung ke ${gData.name}!`);
    } catch (err) {
      showToast('Gagal bergabung ke kelompok.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-pink-50/40 flex items-center justify-center p-4">
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm shadow-lg">
          {toast.msg}
        </div>
      )}
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-pink-100 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Selamat Datang, {userProfile?.name}!</h2>
            <p className="text-xs text-slate-500">Buat kelompok Capstone baru atau masukkan kode undangan dari ketua kelompokmu.</p>
          </div>
          <button onClick={onLogout} className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1">
            <LogOut className="w-3.5 h-3.5" /> Keluar
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={handleCreateGroup} className="p-5 rounded-2xl bg-pink-50/50 border border-pink-100 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-pink-600 text-white flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Buat Kelompok Baru</h3>
              <p className="text-xs text-slate-500 mt-0.5">Kamu otomatis menjadi Ketua Kelompok dan mendapat kode undangan.</p>
            </div>
            <input
              type="text"
              required
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nama Kelompok (misal: Kelompok 4 Capstone)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-pink-200 text-sm focus:outline-none focus:border-pink-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold"
            >
              Buat Kelompok
            </button>
          </form>

          <form onSubmit={handleJoinGroup} className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Gabung Kelompok</h3>
              <p className="text-xs text-slate-500 mt-0.5">Masukkan 6 digit kode undangan yang dibagikan kelompokmu.</p>
            </div>
            <input
              type="text"
              required
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Kode Undangan (misal: X9A2B1)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm uppercase tracking-wider font-mono focus:outline-none focus:border-pink-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              Gabung Sekarang
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. DASHBOARD VIEW
// ============================================================================
function DashboardView({
  courses, tasks, activities, overallProgress,
  calculateCourseProgress, calculateTaskProgress,
  onOpenCourse, onOpenTask, onGoCourses
}) {
  const stats = [
    { label: 'Total Mata Kuliah', value: courses.length, color: 'text-pink-600 bg-pink-50' },
    { label: 'Total Seluruh Tugas', value: tasks.length, color: 'text-slate-700 bg-slate-100' },
    { label: 'Tugas Selesai', value: tasks.filter(t => t.status === 'Selesai').length, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Sedang Dikerjakan', value: tasks.filter(t => t.status === 'Sedang Dikerjakan').length, color: 'text-amber-600 bg-amber-50' },
    { label: 'Belum Dikerjakan', value: tasks.filter(t => t.status === 'Belum Dikerjakan').length, color: 'text-slate-600 bg-slate-100' },
    { label: 'Perlu Revisi', value: tasks.filter(t => t.status === 'Perlu Revisi').length, color: 'text-rose-600 bg-rose-50' },
  ];

  const upcomingTasks = [...tasks]
    .filter(t => t.status !== 'Selesai' && t.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Overall Progress Banner */}
      <div className="bg-gradient-to-r from-pink-600 to-rose-600 rounded-3xl p-6 text-white shadow-md shadow-pink-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold bg-white/20 px-2.5 py-1 rounded-full">
              Progres Keseluruhan Capstone
            </span>
            <h3 className="text-2xl font-extrabold mt-2">{overallProgress}% Selesai</h3>
            <p className="text-xs text-pink-100 mt-0.5">
              Dihitung otomatis dari seluruh checklist pekerjaan anggota di semua mata kuliah.
            </p>
          </div>
          <button
            onClick={onGoCourses}
            className="px-4 py-2.5 rounded-xl bg-white text-pink-700 font-bold text-xs hover:bg-pink-50 transition-colors self-start sm:self-auto"
          >
            + Tambah Mata Kuliah
          </button>
        </div>
        <div className="w-full h-3 bg-white/25 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* 6 Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((st, idx) => (
          <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">{st.label}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-2xl font-extrabold text-slate-900">{st.value}</span>
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${st.color}`}>•</span>
            </div>
          </div>
        ))}
      </div>

      {/* Mata Kuliah Saya */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-900">Mata Kuliah Saya</h3>
          <button onClick={onGoCourses} className="text-xs font-semibold text-pink-600 hover:underline">
            Kelola Semua →
          </button>
        </div>
        {courses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <p className="text-sm text-slate-500 mb-3">Belum ada mata kuliah Capstone yang ditambahkan.</p>
            <button
              onClick={onGoCourses}
              className="px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-semibold"
            >
              + Tambah Mata Kuliah Pertama
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map(course => {
              const cTasks = tasks.filter(t => t.courseId === course.id);
              const doneCount = cTasks.filter(t => t.status === 'Selesai').length;
              const prog = calculateCourseProgress(course.id);
              const nextDeadline = cTasks
                .filter(t => t.status !== 'Selesai' && t.deadline)
                .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]?.deadline;

              return (
                <div key={course.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:border-pink-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: course.color || '#EC4899' }}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 truncate">{course.name}</h4>
                        <p className="text-xs text-slate-500 truncate">{course.lecturer || 'Dosen Pengampu'}</p>
                      </div>
                      <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-lg">
                        {prog}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden my-4">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${prog}%`, backgroundColor: course.color || '#EC4899' }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                      <span>{doneCount}/{cTasks.length} Tugas Selesai</span>
                      <span>Deadline: {nextDeadline ? formatDate(nextDeadline) : '-'}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenCourse(course.id)}
                    className="w-full py-2 rounded-xl bg-slate-50 hover:bg-pink-50 text-slate-700 hover:text-pink-700 font-semibold text-xs border border-slate-200/80 transition-colors"
                  >
                    Lihat Detail
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Grid: Deadlines & Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
          <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-pink-600" /> Deadline Terdekat
          </h3>
          {upcomingTasks.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Tidak ada deadline mendesak.</p>
          ) : (
            <div className="space-y-2.5">
              {upcomingTasks.map(t => {
                const c = courses.find(x => x.id === t.courseId);
                return (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask(t.id)}
                    className="p-3 rounded-xl border border-slate-100 hover:border-pink-200 hover:bg-pink-50/30 cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                      <p className="text-xs text-slate-500">{c?.name || 'Mata Kuliah'} • {formatDate(t.deadline)}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 shrink-0">
                      {t.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
          <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-pink-600" /> Aktivitas Terbaru
          </h3>
          {activities.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Belum ada aktivitas tercatat.</p>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 6).map(act => (
                <div key={act.id} className="flex items-start gap-3 text-xs">
                  <div className="w-7 h-7 rounded-full bg-pink-100 text-pink-700 font-bold flex items-center justify-center shrink-0">
                    {getInitials(act.userName)}
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-800">
                      <span className="font-bold">{act.userName}</span> {act.action}
                    </p>
                    <p className="text-[11px] text-slate-400">{formatDateTime(act.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. COURSES VIEW
// ============================================================================
function CoursesView({ courses, tasks, group, calculateCourseProgress, onOpenCourse, logEvent, showToast }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', lecturer: '', description: '', semester: 'Semester 5', year: '2026/2027', color: COURSE_COLORS[1]
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', lecturer: '', description: '', semester: 'Semester 5', year: '2026/2027', color: COURSE_COLORS[1] });
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name, lecturer: c.lecturer || '', description: c.description || '',
      semester: c.semester || '', year: c.year || '', color: c.color || COURSE_COLORS[1]
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (editing) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', editing.id), form);
      await logEvent(`memperbarui mata kuliah ${form.name}`);
      showToast('Mata kuliah diperbarui!');
    } else {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'courses'), {
        ...form,
        groupId: group.id,
        createdAt: new Date().toISOString()
      });
      await logEvent(`menambahkan mata kuliah ${form.name}`, 'Mata Kuliah Baru');
      showToast('Mata kuliah ditambahkan!');
    }
    setModalOpen(false);
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Hapus mata kuliah "${c.name}"?`)) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', c.id));
    await logEvent(`menghapus mata kuliah ${c.name}`);
    showToast('Mata kuliah dihapus.');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Daftar Mata Kuliah Capstone</h2>
          <p className="text-xs text-slate-500">Kelola seluruh mata kuliah proyek kelompok dalam satu tempat.</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Tambah Mata Kuliah
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
          <BookOpen className="w-10 h-10 text-pink-400 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900">Belum Ada Mata Kuliah</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">Tambahkan mata kuliah seperti Business Valuation, Project Management, dll.</p>
          <button onClick={openAdd} className="px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold">
            + Tambah Mata Kuliah
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map(c => {
            const prog = calculateCourseProgress(c.id);
            const cTasks = tasks.filter(t => t.courseId === c.id);
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-pink-50 text-pink-700">
                      {c.semester} • {c.year}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{c.name}</h3>
                  <p className="text-xs text-slate-500 mb-2">Dosen: {c.lecturer || '-'}</p>
                  <p className="text-xs text-slate-600 line-clamp-2 mb-4">{c.description || 'Tidak ada deskripsi.'}</p>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-500">{cTasks.length} Tugas</span>
                    <span className="text-pink-600">{prog}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: c.color || '#EC4899' }} />
                  </div>
                  <button
                    onClick={() => onOpenCourse(c.id)}
                    className="w-full py-2.5 rounded-xl bg-pink-50 hover:bg-pink-600 text-pink-700 hover:text-white font-bold text-xs transition-colors"
                  >
                    Buka Week & Tugas →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Add/Edit Course */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{editing ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah'}</h3>
              <button onClick={() => setModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Mata Kuliah *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Business Valuation" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Dosen Pengampu</label>
                <input value={form.lecturer} onChange={e => setForm({ ...form, lecturer: e.target.value })} placeholder="Nama Dosen" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Semester</label>
                  <input value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Tahun Akademik</label>
                  <input value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Deskripsi</label>
                <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Warna Identitas</label>
                <div className="flex gap-2">
                  {COURSE_COLORS.map(col => (
                    <button
                      type="button"
                      key={col}
                      onClick={() => setForm({ ...form, color: col })}
                      className={`w-7 h-7 rounded-full border-2 ${form.color === col ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-pink-600 text-white font-bold text-sm">
                Simpan Mata Kuliah
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. COURSE DETAIL & WEEKS MANAGEMENT VIEW
// ============================================================================
function CourseDetailView({
  course, weeks, tasks, group, onBack, onOpenTask,
  calculateTaskProgress, calculateCourseProgress, logEvent, showToast
}) {
  const [weekModal, setWeekModal] = useState(false);
  const [editingWeek, setEditingWeek] = useState(null);
  const [weekForm, setWeekForm] = useState({ title: '', description: '' });

  const [taskModal, setTaskModal] = useState(false);
  const [targetWeekId, setTargetWeekId] = useState('');
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', startDate: '', deadline: '',
    priority: 'Sedang', status: 'Belum Dikerjakan', referenceLink: '', assignees: []
  });

  if (!course) return null;
  const prog = calculateCourseProgress(course.id);
  const doneTasks = tasks.filter(t => t.status === 'Selesai').length;

  const handleSaveWeek = async (e) => {
    e.preventDefault();
    if (editingWeek) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'weeks', editingWeek.id), weekForm);
      showToast('Week diperbarui!');
    } else {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'weeks'), {
        ...weekForm,
        courseId: course.id,
        groupId: group.id,
        order: weeks.length + 1
      });
      await logEvent(`menambahkan ${weekForm.title} di ${course.name}`);
      showToast('Week baru ditambahkan!');
    }
    setWeekModal(false);
  };

  const handleDeleteWeek = async (w) => {
    if (!window.confirm(`Hapus ${w.title}?`)) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'weeks', w.id));
    showToast('Week dihapus.');
  };

  const openAddTask = (weekId) => {
    setTargetWeekId(weekId);
    setTaskForm({
      title: '', description: '', startDate: '', deadline: '',
      priority: 'Sedang', status: 'Belum Dikerjakan', referenceLink: '',
      assignees: (group.members || []).map(m => m.uid)
    });
    setTaskModal(true);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const initialMemberProgress = {};
    taskForm.assignees.forEach(uid => {
      initialMemberProgress[uid] = {
        responsibility: '',
        doneNotes: '',
        todoNotes: '',
        blockers: '',
        status: 'Belum Dikerjakan',
        checklist: [],
        updatedAt: new Date().toISOString()
      };
    });

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'tasks'), {
      ...taskForm,
      courseId: course.id,
      weekId: targetWeekId,
      groupId: group.id,
      memberProgress: initialMemberProgress,
      comments: [],
      createdAt: new Date().toISOString()
    });
    await logEvent(`menambahkan tugas "${taskForm.title}" di ${course.name}`, 'Tugas Baru Ditambahkan');
    showToast('Tugas berhasil ditambahkan!');
    setTaskModal(false);
  };

  const toggleAssignee = (uid) => {
    setTaskForm(prev => ({
      ...prev,
      assignees: prev.assignees.includes(uid)
        ? prev.assignees.filter(id => id !== uid)
        : [...prev.assignees, uid]
    }));
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-xs font-semibold text-slate-600 hover:text-pink-600 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Mata Kuliah
      </button>

      {/* Course Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2.5 py-1 rounded-full">
              {course.semester} • {course.year}
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-2">{course.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Dosen Pengampu: {course.lecturer || '-'}</p>
            <p className="text-sm text-slate-600 mt-2">{course.description}</p>
          </div>
          <div className="bg-pink-50/60 border border-pink-100 rounded-2xl p-4 min-w-[200px]">
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-slate-600">Progres Mata Kuliah</span>
              <span className="text-pink-600">{prog}%</span>
            </div>
            <div className="w-full h-2.5 bg-white rounded-full overflow-hidden mb-2">
              <div className="h-full bg-pink-600 rounded-full" style={{ width: `${prog}%` }} />
            </div>
            <p className="text-[11px] text-slate-500">
              {doneTasks} selesai • {tasks.length - doneTasks} belum selesai
            </p>
          </div>
        </div>
      </div>

      {/* Weeks Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold text-slate-900">Pengelolaan Week Pengerjaan</h3>
        <button
          onClick={() => {
            setEditingWeek(null);
            setWeekForm({ title: `Week ${weeks.length + 1}`, description: '' });
            setWeekModal(true);
          }}
          className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Tambah Week
        </button>
      </div>

      {/* Weeks List */}
      {weeks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-sm text-slate-500 mb-3">Belum ada Week pengerjaan untuk mata kuliah ini.</p>
          <button
            onClick={() => {
              setEditingWeek(null);
              setWeekForm({ title: 'Week 1: Pengenalan dan Pemahaman Materi', description: '' });
              setWeekModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold"
          >
            + Buat Week 1
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {weeks.map(w => {
            const wTasks = tasks.filter(t => t.weekId === w.id);
            const wProg = wTasks.length === 0
              ? 0
              : Math.round(wTasks.reduce((a, b) => a + calculateTaskProgress(b), 0) / wTasks.length);

            return (
              <div key={w.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900">{w.title}</h4>
                      <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-lg">
                        {wProg}%
                      </span>
                    </div>
                    {w.description && <p className="text-xs text-slate-500 mt-0.5">{w.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAddTask(w.id)}
                      className="px-3 py-1.5 rounded-xl bg-pink-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Tugas
                    </button>
                    <button
                      onClick={() => {
                        setEditingWeek(w);
                        setWeekForm({ title: w.title, description: w.description || '' });
                        setWeekModal(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg border border-slate-200"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteWeek(w)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tasks inside Week */}
                <div className="mt-4 space-y-2.5">
                  {wTasks.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Belum ada tugas pada week ini.</p>
                  ) : (
                    wTasks.map(t => {
                      const tProg = calculateTaskProgress(t);
                      const statusObj = STATUS_OPTIONS.find(s => s.label === t.status) || STATUS_OPTIONS[0];
                      const prioObj = PRIORITY_OPTIONS.find(p => p.label === t.priority) || PRIORITY_OPTIONS[1];
                      return (
                        <div
                          key={t.id}
                          onClick={() => onOpenTask(t.id)}
                          className="p-3.5 rounded-xl border border-slate-100 hover:border-pink-300 bg-slate-50/50 hover:bg-pink-50/20 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900">{t.title}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${prioObj.color}`}>
                                {t.priority}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusObj.color}`}>
                                {t.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Deadline: {formatDate(t.deadline)} • {(t.assignees || []).length} Anggota Ditugaskan
                            </p>
                          </div>

                          <div className="flex items-center gap-3 min-w-[160px]">
                            <div className="flex-1">
                              <div className="flex justify-between text-[11px] font-bold mb-1">
                                <span className="text-slate-500">Progres</span>
                                <span className="text-pink-600">{tProg}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-pink-600 rounded-full" style={{ width: `${tProg}%` }} />
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Add/Edit Week */}
      {weekModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{editingWeek ? 'Edit Week' : 'Tambah Week Baru'}</h3>
              <button onClick={() => setWeekModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveWeek} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama / Judul Week *</label>
                <input required value={weekForm.title} onChange={e => setWeekForm({ ...weekForm, title: e.target.value })} placeholder="Contoh: Week 1: Analisis Bisnis" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Keterangan / Target Week</label>
                <textarea rows={2} value={weekForm.description} onChange={e => setWeekForm({ ...weekForm, description: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-pink-600 text-white font-bold text-sm">
                Simpan Week
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Task */}
      {taskModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Tambah Tugas Baru</h3>
              <button onClick={() => setTaskModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Tugas *</label>
                <input required value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Contoh: Pembuatan PPT Presentasi" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Deskripsi Tugas</label>
                <textarea rows={2} value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Tanggal Mulai</label>
                  <input type="date" value={taskForm.startDate} onChange={e => setTaskForm({ ...taskForm, startDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Deadline *</label>
                  <input type="date" required value={taskForm.deadline} onChange={e => setTaskForm({ ...taskForm, deadline: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Prioritas</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                    {PRIORITY_OPTIONS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Status Awal</label>
                  <select value={taskForm.status} onChange={e => setTaskForm({ ...taskForm, status: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                    {STATUS_OPTIONS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Link Referensi / Lampiran (Google Drive / Figma / Colab)</label>
                <input type="url" value={taskForm.referenceLink} onChange={e => setTaskForm({ ...taskForm, referenceLink: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Bagikan Tugas ke Anggota:</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(group.members || []).map(m => {
                    const selected = taskForm.assignees.includes(m.uid);
                    return (
                      <button
                        type="button"
                        key={m.uid}
                        onClick={() => toggleAssignee(m.uid)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                          selected ? 'bg-pink-600 text-white border-pink-600' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-pink-600 text-white font-bold text-sm">
                Simpan Tugas
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 6. TASK DETAIL VIEW (PROGRES PER ANGGOTA, CHECKLIST, REVISI, DISKUSI)
// ============================================================================
function TaskDetailView({
  task, course, week, group, user, userProfile, revisions,
  onBack, calculateTaskProgress, logEvent, showToast
}) {
  const [newChecklistText, setNewChecklistText] = useState({});
  const [commentText, setCommentText] = useState('');
  const [revModal, setRevModal] = useState(false);
  const [revForm, setRevForm] = useState({ part: '', lecturerNotes: '', assigneeId: '', deadline: '' });

  if (!task) return null;

  const taskProg = calculateTaskProgress(task);
  const members = group.members || [];
  const mp = task.memberProgress || {};

  const handleStatusChange = async (newStatus) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tasks', task.id), {
      status: newStatus
    });
    await logEvent(`mengubah status tugas "${task.title}" menjadi ${newStatus}`, 'Perubahan Status Tugas');
    showToast(`Status diubah ke ${newStatus}`);
  };

  const handleUpdateMemberField = async (memberUid, field, value) => {
    const currentData = mp[memberUid] || { checklist: [] };
    const updatedMp = {
      ...mp,
      [memberUid]: {
        ...currentData,
        [field]: value,
        updatedAt: new Date().toISOString(),
        updatedBy: userProfile?.name
      }
    };
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tasks', task.id), {
      memberProgress: updatedMp
    });
  };

  const handleAddChecklist = async (memberUid) => {
    const text = (newChecklistText[memberUid] || '').trim();
    if (!text) return;
    const currentData = mp[memberUid] || { checklist: [] };
    const updatedChecklist = [
      ...(currentData.checklist || []),
      { id: Date.now().toString(), text, done: false }
    ];
    await handleUpdateMemberField(memberUid, 'checklist', updatedChecklist);
    setNewChecklistText(prev => ({ ...prev, [memberUid]: '' }));
    await logEvent(`menambahkan item pekerjaan "${text}" pada tugas ${task.title}`);
  };

  const handleToggleChecklist = async (memberUid, itemId) => {
    const currentData = mp[memberUid] || { checklist: [] };
    const updatedChecklist = (currentData.checklist || []).map(item =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    await handleUpdateMemberField(memberUid, 'checklist', updatedChecklist);
    await logEvent(`memperbarui checklist pekerjaan pada tugas ${task.title}`);
  };

  const handleDeleteChecklist = async (memberUid, itemId) => {
    const currentData = mp[memberUid] || { checklist: [] };
    const updatedChecklist = (currentData.checklist || []).filter(item => item.id !== itemId);
    await handleUpdateMemberField(memberUid, 'checklist', updatedChecklist);
  };

  const handleSendComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const newComment = {
      id: Date.now().toString(),
      senderId: user.uid,
      senderName: userProfile?.name || 'Anggota',
      text: commentText.trim(),
      createdAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tasks', task.id), {
      comments: [...(task.comments || []), newComment]
    });
    const isMention = commentText.includes('@');
    await logEvent(
      `memberikan komentar pada tugas "${task.title}"`,
      isMention ? 'Mention Baru di Diskusi' : 'Komentar Baru'
    );
    setCommentText('');
  };

  const handleAddRevision = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'revisions'), {
      ...revForm,
      taskId: task.id,
      groupId: group.id,
      status: 'Sedang Direvisi',
      resultNotes: '',
      createdAt: new Date().toISOString()
    });
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tasks', task.id), {
      status: 'Perlu Revisi'
    });
    await logEvent(`menambahkan catatan revisi pada tugas "${task.title}"`, 'Revisi Tugas Baru');
    showToast('Catatan revisi ditambahkan!');
    setRevModal(false);
  };

  const handleCompleteRevision = async (revId) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'revisions', revId), {
      status: 'Selesai Direvisi'
    });
    showToast('Revisi ditandai selesai!');
  };

  const handleDeleteTask = async () => {
    if (!window.confirm('Hapus tugas ini secara permanen?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tasks', task.id));
    showToast('Tugas dihapus.');
    onBack();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs font-semibold text-slate-600 hover:text-pink-600 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>
        <button onClick={handleDeleteTask} className="text-xs text-rose-600 hover:underline flex items-center gap-1">
          <Trash2 className="w-3.5 h-3.5" /> Hapus Tugas
        </button>
      </div>

      {/* Task Header Info */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-pink-600 font-bold mb-1">
              <span>{course?.name}</span>
              <span>•</span>
              <span>{week?.title || 'Tugas Capstone'}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900">{task.title}</h2>
            <p className="text-sm text-slate-600 mt-1">{task.description || 'Tidak ada deskripsi tambahan.'}</p>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
              <span>Mulai: <b>{formatDate(task.startDate)}</b></span>
              <span>Deadline: <b className="text-rose-600">{formatDate(task.deadline)}</b></span>
              <span>Prioritas: <b>{task.priority}</b></span>
              {task.referenceLink && (
                <a href={task.referenceLink} target="_blank" rel="noreferrer" className="text-pink-600 font-bold flex items-center gap-1 hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> Link Referensi
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3">
            <select
              value={task.status}
              onChange={e => handleStatusChange(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-pink-200 bg-pink-50/50 text-pink-800 font-bold text-xs focus:outline-none"
            >
              {STATUS_OPTIONS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-2.5 min-w-[200px]">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span>Progres Kelompok</span>
                <span className="text-pink-600">{taskProg}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-pink-600 rounded-full transition-all" style={{ width: `${taskProg}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PROGRES PER ANGGOTA */}
      <div>
        <div className="mb-3">
          <h3 className="text-lg font-extrabold text-slate-900">Progres Anggota Kelompok</h3>
          <p className="text-xs text-slate-500">
            Setiap anggota mencatat bagian tanggung jawab, pekerjaan yang sudah & belum dikerjakan, serta checklist masing-masing.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {members.map(member => {
            const mData = mp[member.uid] || {
              responsibility: '', doneNotes: '', todoNotes: '', blockers: '', checklist: []
            };
            const list = mData.checklist || [];
            const doneCount = list.filter(i => i.done).length;
            const indivProg = list.length === 0 ? 0 : Math.round((doneCount / list.length) * 100);

            return (
              <div key={member.uid} className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pink-600 text-white font-bold text-xs flex items-center justify-center">
                      {getInitials(member.name)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{member.name}</h4>
                      <p className="text-[11px] text-slate-400">
                        Update terakhir: {mData.updatedAt ? formatDateTime(mData.updatedAt) : 'Belum ada'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-extrabold text-pink-600">{indivProg}%</span>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-pink-600 rounded-full" style={{ width: `${indivProg}%` }} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Bagian Pekerjaan / Tanggung Jawab
                  </label>
                  <input
                    type="text"
                    defaultValue={mData.responsibility}
                    onBlur={e => handleUpdateMemberField(member.uid, 'responsibility', e.target.value)}
                    placeholder="Contoh: Membuat slide latar belakang & analisis"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Checklist Pekerjaan ({doneCount}/{list.length})
                  </label>
                  <div className="space-y-1.5 mb-2">
                    {list.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 hover:bg-pink-50/40">
                        <button
                          type="button"
                          onClick={() => handleToggleChecklist(member.uid, item.id)}
                          className="flex items-center gap-2 text-left flex-1"
                        >
                          {item.done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className={`text-xs ${item.done ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                            {item.text}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteChecklist(member.uid, item.id)}
                          className="text-slate-300 hover:text-rose-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newChecklistText[member.uid] || ''}
                      onChange={e => setNewChecklistText(prev => ({ ...prev, [member.uid]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddChecklist(member.uid))}
                      placeholder="+ Tambah item pekerjaan..."
                      className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddChecklist(member.uid)}
                      className="px-3 py-1.5 rounded-xl bg-pink-600 text-white text-xs font-bold"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                      ✓ Sudah Dikerjakan
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={mData.doneNotes}
                      onBlur={e => handleUpdateMemberField(member.uid, 'doneNotes', e.target.value)}
                      placeholder="Catat yang sudah selesai..."
                      className="w-full p-2.5 rounded-xl bg-emerald-50/40 border border-emerald-200/80 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-700 mb-1">
                      ⏳ Belum Dikerjakan
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={mData.todoNotes}
                      onBlur={e => handleUpdateMemberField(member.uid, 'todoNotes', e.target.value)}
                      placeholder="Catat sisa pekerjaan..."
                      className="w-full p-2.5 rounded-xl bg-amber-50/40 border border-amber-200/80 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-rose-700 mb-1">
                    Kendala / Hambatan (Opsional)
                  </label>
                  <input
                    type="text"
                    defaultValue={mData.blockers}
                    onBlur={e => handleUpdateMemberField(member.uid, 'blockers', e.target.value)}
                    placeholder="Tulis jika ada kendala pengerjaan..."
                    className="w-full px-3 py-1.5 rounded-xl bg-rose-50/30 border border-rose-200/70 text-xs focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Grid: Revisions & Discussion */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-rose-600" /> Catatan Revisi Tugas
            </h3>
            <button
              onClick={() => setRevModal(true)}
              className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold"
            >
              + Tambah Revisi
            </button>
          </div>

          {revisions.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Belum ada catatan revisi untuk tugas ini.</p>
          ) : (
            <div className="space-y-3">
              {revisions.map(rev => {
                const pic = members.find(m => m.uid === rev.assigneeId);
                return (
                  <div key={rev.id} className="p-3.5 rounded-xl border border-rose-100 bg-rose-50/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{rev.part}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        rev.status === 'Selesai Direvisi' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {rev.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700">{rev.lecturerNotes}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>PJ: <b>{pic?.name || 'Semua'}</b> • Deadline: {formatDate(rev.deadline)}</span>
                      {rev.status !== 'Selesai Direvisi' && (
                        <button
                          onClick={() => handleCompleteRevision(rev.id)}
                          className="text-emerald-700 font-bold hover:underline"
                        >
                          Tandai Selesai ✓
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-pink-600" /> Diskusi & Arahan Tugas
            </h3>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(task.comments || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Belum ada diskusi. Gunakan @Nama untuk mention anggota.</p>
              ) : (
                (task.comments || []).map(c => (
                  <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900">{c.senderName}</span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-slate-700">{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <form onSubmit={handleSendComment} className="flex gap-2 pt-2 border-t border-slate-100">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Tulis instruksi atau @Nama anggota..."
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-pink-500"
            />
            <button type="submit" className="px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold flex items-center gap-1">
              <Send className="w-3.5 h-3.5" /> Kirim
            </button>
          </form>
        </div>
      </div>

      {/* Modal Add Revision */}
      {revModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Tambah Catatan Revisi</h3>
              <button onClick={() => setRevModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddRevision} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Bagian yang Perlu Diperbaiki *</label>
                <input required value={revForm.part} onChange={e => setRevForm({ ...revForm, part: e.target.value })} placeholder="Contoh: Perhitungan NPV & Proyeksi" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Catatan Revisi Dosen / Kelompok *</label>
                <textarea required rows={3} value={revForm.lecturerNotes} onChange={e => setRevForm({ ...revForm, lecturerNotes: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Anggota Bertanggung Jawab</label>
                  <select value={revForm.assigneeId} onChange={e => setRevForm({ ...revForm, assigneeId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                    <option value="">Pilih Anggota</option>
                    {members.map(m => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Deadline Revisi</label>
                  <input type="date" value={revForm.deadline} onChange={e => setRevForm({ ...revForm, deadline: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm">
                Simpan Revisi
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 7. ALL TASKS VIEW
// ============================================================================
function AllTasksView({ courses, weeks, tasks, calculateTaskProgress, onOpenTask }) {
  const [filterCourse, setFilterCourse] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const filtered = tasks.filter(t => {
    if (filterCourse !== 'ALL' && t.courseId !== filterCourse) return false;
    if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Semua Tugas Capstone</h2>
          <p className="text-xs text-slate-500">Daftar seluruh tugas lintas mata kuliah dan minggu pengerjaan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold">
            <option value="ALL">Semua Mata Kuliah</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold">
            <option value="ALL">Semua Status</option>
            {STATUS_OPTIONS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase text-slate-500">
                <th className="p-4">Tugas</th>
                <th className="p-4">Mata Kuliah</th>
                <th className="p-4">Deadline</th>
                <th className="p-4">Status</th>
                <th className="p-4">Progres</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">Tidak ada tugas yang sesuai filter.</td>
                </tr>
              ) : (
                filtered.map(t => {
                  const c = courses.find(x => x.id === t.courseId);
                  const w = weeks.find(x => x.id === t.weekId);
                  const prog = calculateTaskProgress(t);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onOpenTask(t.id)}
                      className="hover:bg-pink-50/30 cursor-pointer transition-colors"
                    >
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{t.title}</p>
                        <p className="text-[11px] text-slate-400">{w?.title || '-'}</p>
                      </td>
                      <td className="p-4 font-medium text-slate-700">{c?.name || '-'}</td>
                      <td className="p-4 text-slate-600">{formatDate(t.deadline)}</td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-lg bg-pink-50 text-pink-700 font-bold text-[11px]">
                          {t.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-pink-600" style={{ width: `${prog}%` }} />
                          </div>
                          <span className="font-bold text-pink-600">{prog}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 8. CALENDAR VIEW
// ============================================================================
function CalendarView({ courses, tasks, onOpenTask }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split('T')[0]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, dateStr });
  }

  const dayTasks = tasks.filter(t => t.deadline === selectedDay);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-900">
            {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="flex gap-1">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 mb-2">
          {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => <div key={d}>{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {days.map((item, idx) => {
            if (!item) return <div key={idx} className="h-16" />;
            const tCount = tasks.filter(t => t.deadline === item.dateStr).length;
            const isSelected = selectedDay === item.dateStr;
            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(item.dateStr)}
                className={`h-16 rounded-2xl border p-1.5 flex flex-col items-center justify-between transition-all ${
                  isSelected ? 'border-pink-600 bg-pink-50/70' : 'border-slate-100 hover:border-pink-200'
                }`}
              >
                <span className={`text-xs font-bold ${isSelected ? 'text-pink-700' : 'text-slate-700'}`}>{item.day}</span>
                {tCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-pink-600 text-white text-[10px] font-bold">
                    {tCount} tugas
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm">
        <h4 className="font-bold text-slate-900 mb-1">Deadline Tanggal</h4>
        <p className="text-xs text-pink-600 font-semibold mb-4">{formatDate(selectedDay)}</p>
        {dayTasks.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">Tidak ada deadline pada tanggal ini.</p>
        ) : (
          <div className="space-y-2.5">
            {dayTasks.map(t => {
              const c = courses.find(x => x.id === t.courseId);
              return (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="p-3 rounded-xl border border-slate-100 hover:border-pink-300 cursor-pointer"
                >
                  <p className="text-xs font-bold text-slate-900">{t.title}</p>
                  <p className="text-[11px] text-slate-500">{c?.name} • {t.status}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 9. ACTIVITY VIEW
// ============================================================================
function ActivityView({ activities }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
      <h2 className="text-lg font-extrabold text-slate-900 mb-4">Riwayat Aktivitas Kelompok</h2>
      {activities.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">Belum ada riwayat aktivitas.</p>
      ) : (
        <div className="space-y-4">
          {activities.map(act => (
            <div key={act.id} className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0">
              <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-700 font-bold text-xs flex items-center justify-center shrink-0">
                {getInitials(act.userName)}
              </div>
              <div>
                <p className="text-sm text-slate-800">
                  <span className="font-bold">{act.userName}</span> {act.action}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(act.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 10. MEMBERS VIEW
// ============================================================================
function MembersView({ group, courses, tasks, onOpenTask, showToast }) {
  const members = group.members || [];
  const inviteUrl = `${window.location.origin}?invite=${group.inviteCode}`;

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    showToast('Link undangan kelompok disalin!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-pink-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Anggota Kelompok ({members.length})</h2>
          <p className="text-xs text-slate-500">Kode Undangan: <b className="font-mono text-pink-600">{group.inviteCode}</b></p>
        </div>
        <button
          onClick={copyInvite}
          className="px-4 py-2.5 rounded-xl bg-pink-600 text-white text-xs font-bold flex items-center gap-1.5 self-start"
        >
          <Copy className="w-4 h-4" /> Salin Link Undangan
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {members.map(m => {
          const memberTasks = tasks.filter(t => (t.assignees || []).includes(m.uid));
          return (
            <div key={m.uid} className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-pink-600 text-white font-bold flex items-center justify-center">
                  {getInitials(m.name)}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{m.name}</h4>
                  <p className="text-xs text-slate-500">{m.email} • <span className="text-pink-600 font-semibold">{m.role}</span></p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">Tanggung Jawab Tugas ({memberTasks.length}):</p>
                {memberTasks.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada tugas yang dibagikan.</p>
                ) : (
                  <div className="space-y-1.5">
                    {memberTasks.map(t => {
                      const c = courses.find(x => x.id === t.courseId);
                      return (
                        <div
                          key={t.id}
                          onClick={() => onOpenTask(t.id)}
                          className="p-2.5 rounded-xl bg-slate-50 hover:bg-pink-50/50 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-slate-800">{t.title} ({c?.name})</span>
                          <span className="text-[11px] font-bold text-pink-600">{t.status}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 11. NOTIFICATIONS VIEW
// ============================================================================
function NotificationsView({ notifications, user }) {
  const markRead = async (n) => {
    if ((n.readBy || []).includes(user.uid)) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notifications', n.id), {
      readBy: arrayUnion(user.uid)
    });
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
      <h2 className="text-lg font-extrabold text-slate-900 mb-4">Pusat Notifikasi</h2>
      {notifications.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">Belum ada notifikasi baru.</p>
      ) : (
        <div className="space-y-2.5">
          {notifications.map(n => {
            const isRead = (n.readBy || []).includes(user.uid);
            return (
              <div
                key={n.id}
                onClick={() => markRead(n)}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                  isRead ? 'bg-white border-slate-100' : 'bg-pink-50/50 border-pink-200'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-pink-700">{n.title}</span>
                  <span className="text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-700">{n.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 12. SETTINGS VIEW
// ============================================================================
function SettingsView({ user, userProfile, group, currentMemberRole, showToast }) {
  const [name, setName] = useState(userProfile?.name || '');
  const [groupName, setGroupName] = useState(group?.name || '');

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), { name });
    const updatedMembers = (group.members || []).map(m =>
      m.uid === user.uid ? { ...m, name } : m
    );
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'groups', group.id), {
      members: updatedMembers
    });
    showToast('Profil berhasil diperbarui!');
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'groups', group.id), {
      name: groupName
    });
    showToast('Nama kelompok diperbarui!');
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl border border-slate-200/80 p-6 space-y-4">
        <h3 className="font-bold text-slate-900">Pengaturan Profil Pengguna</h3>
        <div>
          <label className="block text-xs font-semibold mb-1">Nama Tampilan</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Email</label>
          <input disabled value={userProfile?.email || ''} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-500" />
        </div>
        <button type="submit" className="px-4 py-2.5 rounded-xl bg-pink-600 text-white text-xs font-bold">
          Simpan Profil
        </button>
      </form>

      <form onSubmit={handleSaveGroup} className="bg-white rounded-3xl border border-slate-200/80 p-6 space-y-4">
        <h3 className="font-bold text-slate-900">Pengaturan Kelompok</h3>
        <div>
          <label className="block text-xs font-semibold mb-1">Nama Kelompok</label>
          <input
            disabled={currentMemberRole !== 'Ketua Kelompok'}
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Kode Undangan</label>
          <input disabled value={group.inviteCode} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm font-mono font-bold text-pink-600" />
        </div>
        {currentMemberRole === 'Ketua Kelompok' && (
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold">
            Simpan Pengaturan Kelompok
          </button>
        )}
      </form>
    </div>
  );
}
