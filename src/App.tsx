import { useState, useMemo, useEffect, FormEvent } from 'react';
import { 
  Calendar as CalendarIcon,
  Users, 
  Search, 
  Plus, 
  Clock,
  LayoutDashboard,
  Settings as SettingsIcon,
  Bell,
  CheckCircle2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Users2,
  Layers,
  ArrowRight,
  RefreshCcw,
  Settings2,
  BellOff,
  Lock
} from 'lucide-react';
import { 
  format, 
  addDays, 
  startOfWeek, 
  addWeeks, 
  isSameDay, 
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  addMonths,
  subMonths,
  isSameMonth,
  endOfWeek
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth, db } from './lib/firebase';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { 
  syncUserData, 
  createProfile, 
  syncGroupAvailability, 
  syncAllUsersInGroup,
  addAvailability,
  deleteAvailability,
  duplicateAvailabilityToWeeks,
  adminDeleteUser,
  requestAdminPrivileges,
  checkAdminStatus,
  purgeAllGroupData,
  adminToggleUserVisibility,
  updateProfile,
  createTeamCode,
  deleteTeamCode,
  syncTeamCodes,
  validateTeamCode
} from './lib/firebaseService';

// --- Shared Components ---

const IconButton = ({ children, className, onClick, tooltip }: any) => (
  <button 
    onClick={onClick}
    className={cn(
      "p-2 bg-white/5 border border-white/10 rounded-sm text-white/40 hover:text-white transition-all group relative backdrop-blur-md hover:bg-white/10 active:scale-95",
      className
    )}
  >
    {children}
    {tooltip && (
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] font-bold rounded-sm opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {tooltip}
      </span>
    )}
  </button>
);

const Badge = ({ children, variant = 'default', className }: any) => (
  <span className={cn(
    "px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest border backdrop-blur-md",
    variant === 'default' ? "bg-white/5 text-white/30 border-white/5" : 
    variant === 'success' ? "bg-vivid-blue/10 text-vivid-blue border-vivid-blue/20" :
    variant === 'busy' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-white/5 text-white/40 border-white/5",
    className
  )}>
    {children}
  </span>
);

// --- Main Application ---

export default function App() {
  const [fUser, setFUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [groupUsers, setGroupUsers] = useState<any[]>([]);
  const [groupAvailability, setGroupAvailability] = useState<any[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [direction, setDirection] = useState(0); // -1 for left, 1 for right
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isAdminView, setIsAdminView] = useState(window.location.pathname === '/admin');
  const [currentView, setCurrentView] = useState<'dashboard' | 'settings'>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('24h');

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const formatHour = (h: number) => {
    const normalisedH = h % 24;
    if (timeFormat === '24h') return `${h}:00`;
    const period = (h >= 12 && h < 24) || h === 36 ? 'PM' : 'AM'; // Simple enough for our range
    const displayHour = normalisedH % 12 || 12;
    return `${displayHour} ${period}`;
  };

  const handleSetViewDate = (newDate: Date) => {
    setDirection(newDate > viewDate ? 1 : -1);
    setViewDate(newDate);
  };

  // Listen for navigation
  useEffect(() => {
    const handlePopState = () => {
      setIsAdminView(window.location.pathname === '/admin');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setIsAdminView(true);
  };

  const navigateToDashboard = () => {
    window.history.pushState({}, '', '/');
    setIsAdminView(false);
  };

  // Listen for Auth changes
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFUser(user);
      if (!user) {
        setUserProfile(null);
        setLoading(false);
      }
    });
  }, []);

  // Listen for User Profile changes
  useEffect(() => {
    if (!fUser) return;
    return syncUserData(fUser.uid, (profile) => {
      setUserProfile(profile);
      setLoading(false);
    });
  }, [fUser]);

  // Listen for Group Data
  useEffect(() => {
    if (!userProfile?.groupId) {
      setGroupUsers([]);
      setGroupAvailability([]);
      return;
    }
    const unsubUsers = syncAllUsersInGroup(userProfile.groupId, (users) => {
      setGroupUsers(users);
      // Initialize selection if empty
      setSelectedUserIds(prev => prev.size === 0 ? new Set(users.map((u: any) => u.uid)) : prev);
    });
    const unsubAvail = syncGroupAvailability(userProfile.groupId, setGroupAvailability);
    return () => {
      unsubUsers();
      unsubAvail();
    };
  }, [userProfile?.groupId, refreshKey]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  const hours = useMemo(() => Array.from({ length: 15 }).map((_, i) => i + 9), []); // 9 AM to 11 PM
  const todayStr = format(viewDate, 'yyyy-MM-dd');

  const visibleUsers = useMemo(() => {
    return groupUsers.filter(u => !u.isHidden || u.uid === fUser?.uid);
  }, [groupUsers, fUser?.uid]);
  const visibleUserIds = useMemo(() => new Set(visibleUsers.map(u => u.uid || u.id)), [visibleUsers]);

  const overlaps = useMemo(() => {
    const counts: Record<number, number> = {};
    hours.forEach(h => {
      counts[h] = groupAvailability.filter((a: any) => 
        a.date === todayStr && 
        a.startTime === h * 60 && 
        a.type === 'free' &&
        visibleUserIds.has(a.userId) &&
        (selectedUserIds.size === 0 || selectedUserIds.has(a.userId))
      ).length;
    });
    return counts;
  }, [groupAvailability, todayStr, hours, selectedUserIds, visibleUserIds]);

  const visibleAvailability = useMemo(() => 
    groupAvailability.filter((a: any) => visibleUserIds.has(a.userId)),
    [groupAvailability, visibleUserIds]
  );

  const handleLogin = async (emailData: { email: string, pass: string, isNew: boolean }) => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    
    try {
      if (emailData) {
        const { email, pass, isNew } = emailData;
        if (isNew) {
          await createUserWithEmailAndPassword(auth, email, pass);
        } else {
          await signInWithEmailAndPassword(auth, email, pass);
        }
      }
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error("Authentication failed:", error);
        
        let message = `An error occurred (${error.code}). Please try again.`;
        
        switch (error.code) {
          case 'auth/operation-not-allowed':
            message = "This sign-in method is not enabled in the Firebase Console for this project.";
            break;
          case 'auth/email-already-in-use':
            message = "This email is already registered. Try signing in instead.";
            break;
          case 'auth/invalid-credential':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
            message = "Incorrect email or password. Please check your details.";
            break;
          case 'auth/weak-password':
            message = "Your password is too weak. Please use at least 6 characters.";
            break;
          case 'auth/invalid-email':
            message = "Please enter a valid email address.";
            break;
        }
        
        setLoginError(message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-2 border-white border-t-transparent rounded-full" 
        />
      </div>
    );
  }

  if (!fUser) {
    return <LandingPage onLogin={handleLogin} isLoggingIn={isLoggingIn} error={loginError} />;
  }

  if (!userProfile) {
    return <Onboarding user={fUser} onComplete={(data: any) => createProfile(fUser.uid, { ...data, email: fUser.email, avatar: fUser.photoURL })} />;
  }

  if (isAdminView) {
    return <AdminDashboard groupUsers={groupUsers} onBack={navigateToDashboard} />;
  }

  if (currentView === 'settings') {
    return <SettingsView userProfile={userProfile} onBack={() => setCurrentView('dashboard')} />;
  }

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col font-sans overflow-hidden noise selection:bg-vivid-blue selection:text-black">
      {/* Liquid Glass Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-vivid-blue/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pale-blue/5 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full liquid-flare opacity-50" />
      </div>

      <header className="h-16 bg-black/40 backdrop-blur-xl border-b border-white/10 px-6 flex items-center justify-between flex-shrink-0 z-40">
        <div className="flex items-center gap-4">
           <IconButton 
             onClick={() => setShowSidebar(!showSidebar)}
             tooltip={showSidebar ? "Close Sidebar" : "Open Sidebar"}
             className="hidden md:flex bg-white/5 border-white/5"
           >
             <Layers className={cn("w-4 h-4 transition-transform", !showSidebar && "-rotate-90")} />
           </IconButton>
           <h1 className="text-[11px] font-display font-bold uppercase tracking-[0.3em] hidden sm:block text-white">Team Sync App</h1>
        </div>

        <div className="flex items-center gap-2">
          <IconButton 
            onClick={() => setTimeFormat(timeFormat === '12h' ? '24h' : '12h')}
            tooltip={timeFormat === '12h' ? "Switch to 24h" : "Switch to 12h"}
            className="flex bg-white/5 border-white/5 font-mono text-[9px] font-bold"
          >
            {timeFormat.toUpperCase()}
          </IconButton>
          <IconButton 
            onClick={handleRefresh}
            tooltip="Refresh Grid"
            className="flex bg-white/5 border-white/5"
          >
            <RefreshCcw className={cn("w-4 h-4", refreshKey > 0 && "animate-spin-once")} />
          </IconButton>
          <IconButton 
            onClick={() => setCurrentView(currentView === 'dashboard' ? 'settings' : 'dashboard')}
            tooltip="Profile Settings"
            className="flex bg-white/5 border-white/5"
          >
            <Settings2 className="w-4 h-4" />
          </IconButton>
          <IconButton 
            onClick={navigateToAdmin}
            tooltip="Admin Dashboard"
            className="hidden sm:flex bg-white/5 border-white/5"
          >
            <Lock className="w-4 h-4" />
          </IconButton>
          <button 
             onClick={() => setShowMobileCalendar(true)}
             className="md:hidden p-2 text-white/40 hover:text-white transition-colors"
          >
            <CalendarIcon className="w-5 h-5" />
          </button>
          <div className="text-right mr-2 hidden md:block">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">{userProfile.name}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-9 h-9 border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-red-500 transition-colors rounded-sm backdrop-blur-md"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {showMobileCalendar && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowMobileCalendar(false)}
          >
            <motion.div 
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              exit={{ y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm"
            >
               <MonthCalendar 
                viewDate={viewDate} 
                setViewDate={handleSetViewDate} 
                availability={groupAvailability} 
                usersCount={groupUsers.length}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-grow flex p-0 sm:p-6 gap-6 overflow-hidden">
        <AnimatePresence initial={false}>
          {showSidebar && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ ease: "easeInOut", duration: 0.3 }}
              className="flex-shrink-0 flex-col gap-6 overflow-y-auto px-0 py-0 hidden md:flex custom-scrollbar h-full"
            >
          <MonthCalendar 
            viewDate={viewDate} 
            setViewDate={handleSetViewDate} 
            availability={groupAvailability} 
            usersCount={groupUsers.length}
          />
          
          <div className="bg-zinc-900/30 border border-white/5 rounded-sm p-6 shadow-2xl backdrop-blur-3xl glass">
            <h3 className="text-[10px] font-display font-bold text-white/20 uppercase tracking-[0.2em] mb-4 underline decoration-white/5 underline-offset-8">Legend</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm bg-vivid-blue shadow-[0_0_10px_rgba(125,249,255,0.4)]" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Free</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm border border-dashed border-vivid-blue/40 shadow-[inset_0_0_5px_rgba(125,249,255,0.2)]" />
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Optimal</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm bg-white/5 border border-white/10" />
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Locked</span>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/5">
              <h3 className="text-[10px] font-display font-bold text-white/20 uppercase tracking-[0.2em] mb-4">Shortcuts</h3>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setViewDate(new Date())}
                  className="px-3 py-2 bg-white/5 text-[9px] font-bold rounded-sm border border-white/10 hover:bg-white hover:text-black transition-all uppercase tracking-widest backdrop-blur-md"
                >
                  Today
                </button>
                <button 
                  onClick={() => setViewDate(addWeeks(viewDate, 1))}
                  className="px-3 py-2 bg-white/5 text-[9px] font-bold rounded-sm border border-white/10 hover:bg-white hover:text-black transition-all uppercase tracking-widest backdrop-blur-md"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-white/5">
               <h3 className="text-[10px] font-display font-bold text-white/20 uppercase tracking-[0.2em] mb-4">Analysis</h3>
               <AlignmentSearch 
                 users={visibleUsers} 
                 availability={visibleAvailability} 
                 selectedUserIds={selectedUserIds}
                 viewDate={viewDate}
                 hours={hours}
                 formatHour={formatHour}
               />
            </div>

            <div className="mt-8 pt-8 border-t border-white/5">
               <div className="space-y-4">
                  {Object.entries(overlaps).filter(([_, count]) => (count as number) > 0).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).slice(0, 3).map(([h, count]) => (
                    <div key={h} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-vivid-blue/60" />
                        <span className="text-[10px] font-bold text-white/40 tracking-widest">{formatHour(Number(h))}</span>
                      </div>
                      <Badge variant={(count as number) >= (selectedUserIds.size || groupUsers.length) * 0.7 ? "success" : "default"}>
                        {count} / {selectedUserIds.size || groupUsers.length}
                      </Badge>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </motion.aside>
          )}
        </AnimatePresence>

        <MatrixView 
          users={visibleUsers} 
          availability={visibleAvailability} 
          currentUserId={fUser.uid} 
          viewDate={viewDate}
          setViewDate={handleSetViewDate}
          viewMode={viewMode}
          setViewMode={setViewMode}
          direction={direction}
          userProfile={userProfile}
          hours={hours}
          formatHour={formatHour}
          overlaps={overlaps}
          selectedUserIds={selectedUserIds}
          setSelectedUserIds={setSelectedUserIds}
        />
      </main>
    </div>
  );
}

// --- Admin Dashboard ---

function AdminDashboard({ groupUsers, onBack }: { groupUsers: any[], onBack: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [error, setError] = useState('');
  const [teamCodes, setTeamCodes] = useState<any[]>([]);
  const [newCode, setNewCode] = useState('');
  const [showCodeManager, setShowCodeManager] = useState(false);

  useEffect(() => {
    const unsub = syncTeamCodes(setTeamCodes);
    return () => unsub();
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      const isAdmin = await checkAdminStatus();
      if (isAdmin) setIsAuthorized(true);
      setIsVerifying(false);
    };
    checkStatus();
  }, []);

  const handleAuthorize = async (e: FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    try {
      await requestAdminPrivileges(passcode);
      setIsAuthorized(true);
      setError('');
    } catch (err: any) {
      setError('Authorization Failed: ' + (err.message || 'Check access code'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!userId || isDeleting) return;
    
    if (window.confirm('TERMINATION PROTOCOL: Are you sure you want to delete this user and all their data? This cannot be undone.')) {
      setIsDeleting(userId);
      try {
        await adminDeleteUser(userId);
      } catch (err: any) {
        console.error("Admin Deletion Error:", err);
        alert("Deletion failed: " + (err.message || "Unknown error"));
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const handlePurgeAll = async () => {
    const confirmCode = window.prompt('DANGER: Master Purge requested. This will delete EVERY user in this cluster. Enter the MASTER OVERRIDE CODE to authorize (TALKWARE2026):');
    
    if (confirmCode === 'TALKWARE2026') {
      const groupId = groupUsers[0]?.groupId;
      if (!groupId) return alert("No Team Access Code identified.");
      
      setIsPurging(true);
      try {
        const stats: any = await purgeAllGroupData(groupId);
        alert(`PURGE COMPLETE: ${stats.usersRemoved} nodes deactivated. ${stats.recordsRemoved} records destroyed.`);
      } catch (err: any) {
        alert("Purge failed: " + err.message);
      } finally {
        setIsPurging(false);
      }
    } else if (confirmCode !== null) {
      alert("INCORRECT MASTER CODE. PURGE ABORTED.");
    }
  };

  if (isVerifying) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center p-6 text-center overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-red-950/10 blur-[120px]" />
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xs w-full glass p-8 rounded-sm relative z-10 border-red-500/20"
        >
          <div className="flex justify-center mb-6 text-red-500 animate-pulse">
             <SettingsIcon className="w-8 h-8" />
          </div>
          <h2 className="text-sm font-display uppercase tracking-[0.25em] text-white mb-6">Restricted / Secure</h2>
          <form onSubmit={handleAuthorize} className="space-y-4">
            <input 
              type="password" 
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="ACCESS CODE"
              className="w-full p-3 bg-red-950/20 border border-white/10 rounded-sm focus:outline-none focus:border-red-500/50 text-xs text-white text-center tracking-widest mb-2"
              autoFocus
            />
            {error && <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest">{error}</p>}
            <button className="w-full py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-white/90 transition-all">
              Initialize Admin
            </button>
            <button type="button" onClick={onBack} className="w-full py-3 text-white/40 text-[9px] font-bold uppercase tracking-widest hover:text-white transition-colors">
              Return to Terminal
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-black flex flex-col p-8 sm:p-16 overflow-hidden relative selection:bg-red-500 selection:text-white">
      <div className="absolute inset-0 pointer-events-none noise opacity-20" />
      
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6 relative z-10">
        <div>
          <div className="flex items-center gap-4 mb-4">
             <div className="w-12 h-1 bg-red-600" />
             <span className="text-[10px] font-black tracking-[0.3em] text-red-600 uppercase">System Override</span>
          </div>
          <h1 className="text-3xl font-display uppercase tracking-[0.4em] text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">Admin / Dashboard</h1>
          <p className="text-[11px] text-white/30 uppercase tracking-[0.25em] mt-3 font-bold">Node: {window.location.hostname} / Sec: Grade-A</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowCodeManager(!showCodeManager)}
            className="px-8 py-3 border border-vivid-blue/50 bg-vivid-blue/5 text-vivid-blue text-[10px] font-bold uppercase tracking-widest hover:bg-vivid-blue hover:text-black transition-all rounded-sm backdrop-blur-3xl"
          >
            {showCodeManager ? 'User Grid' : 'Team Access Codes'}
          </button>
          <button 
            onClick={handlePurgeAll}
            disabled={isPurging}
            className="px-8 py-3 border border-red-500/50 bg-red-500/5 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all rounded-sm backdrop-blur-3xl disabled:opacity-50 disabled:cursor-wait"
          >
            {isPurging ? 'Purging Team...' : 'Purge All Team Data'}
          </button>
          <button 
            onClick={onBack}
            className="px-8 py-3 border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all rounded-sm backdrop-blur-3xl"
          >
            Exit Dashboard
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar relative z-10 pr-4">
        <AnimatePresence mode="wait">
          {showCodeManager ? (
            <motion.div 
              key="code-manager"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto w-full space-y-8 pb-32"
            >
              <div className="p-8 glass border-vivid-blue/20">
                <h3 className="text-sm font-display uppercase tracking-[0.3em] text-white mb-6">Authorize New Access Code</h3>
                <div className="flex flex-col sm:flex-row gap-4">
                   <input 
                      value={newCode}
                      onChange={e => setNewCode(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      placeholder="NEW-TEAM-CODE"
                      className="flex-grow p-4 bg-black/40 border border-white/10 rounded-sm focus:border-vivid-blue/50 focus:outline-none text-xs font-mono uppercase tracking-[0.2em] text-white"
                   />
                   <button 
                      onClick={async () => {
                        if (!newCode) return;
                        await createTeamCode(newCode, "Authorized Team Access Code");
                        setNewCode('');
                      }}
                      className="px-12 py-4 bg-vivid-blue text-black font-black text-[10px] uppercase tracking-widest rounded-sm hover:invert transition-all"
                   >
                     Authorize Code
                   </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {teamCodes.map(code => (
                   <motion.div 
                      key={code.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-6 bg-zinc-900/40 border border-white/5 rounded-sm flex flex-col justify-between group"
                   >
                      <div>
                         <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-vivid-blue shadow-[0_0_8px_rgba(125,249,255,0.5)]" />
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Authorized Path</span>
                         </div>
                         <h4 className="text-xl font-mono uppercase tracking-[0.2em] text-vivid-blue mb-2">{code.code}</h4>
                         <p className="text-[9px] text-white/30 uppercase font-black leading-relaxed">{code.description}</p>
                      </div>
                      <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                         <span className="text-[9px] text-white/20 font-mono">ID: {code.id.slice(0, 8)}</span>
                         <button 
                            onClick={async () => {
                               if (window.confirm(`REVOKE ACCESS: Remove team code "${code.code}"? New users will no longer be able to use it.`)) {
                                  await deleteTeamCode(code.id);
                               }
                            }}
                            className="text-[9px] font-black uppercase text-red-500/50 hover:text-red-500 transition-colors"
                         >
                            Revoke
                         </button>
                      </div>
                   </motion.div>
                 ))}
                 {teamCodes.length === 0 && (
                   <div className="col-span-full py-20 text-center border border-white/5 bg-white/5 border-dashed rounded-sm">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/20 mb-6">No Authorized Team Access Codes Found</p>
                      <button 
                        onClick={() => createTeamCode('talkware2026', 'Primary Master Team Access Code')}
                        className="px-8 py-3 bg-vivid-blue/10 border border-vivid-blue/30 text-vivid-blue text-[10px] font-bold uppercase tracking-widest hover:bg-vivid-blue hover:text-black transition-all rounded-sm"
                      >
                        Register talkware2026 as Master Code
                      </button>
                   </div>
                 )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="user-grid"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {groupUsers.map(user => (
                <motion.div 
                  key={user.id || user.uid}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                  className="p-8 bg-zinc-900/40 border border-white/5 rounded-sm group hover:border-red-500/40 transition-all backdrop-blur-3xl relative"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-100 transition-opacity">
                     <Users2 className="w-4 h-4 text-white" />
                  </div>
                  
                  <div className="flex items-center gap-5 mb-8">
                    <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-sm flex items-center justify-center text-white/20 group-hover:text-red-500 group-hover:border-red-500/20 transition-all">
                      <Users2 className="w-6 h-6" />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-1">{user.name}</h3>
                      <p className="text-[9px] text-white/20 uppercase tracking-widest font-black leading-none">{user.role} / Team Access Code: {user.groupId}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-white/5">
                     <div className="flex items-center justify-between text-[11px] uppercase tracking-widest font-bold">
                        <span className="text-white/20">Ident:</span>
                        <span className="text-white/60 font-mono">{(user.id || user.uid || '').slice(0, 12)}</span>
                     </div>
                     <div className="flex items-center justify-between text-[11px] uppercase tracking-widest font-bold">
                        <span className="text-white/20">Access:</span>
                        <span className={cn("font-black", user.isHidden ? "text-red-500" : "text-emerald-500")}>
                          {user.isHidden ? 'HIDDEN / OFFLINE' : 'VISIBLE / ACTIVE'}
                        </span>
                     </div>
                     
                     <div className="pt-6 flex flex-col gap-4">
                        <button 
                          onClick={() => adminToggleUserVisibility(user.id || user.uid, !user.isHidden)}
                          className={cn(
                            "w-full py-4 border text-[11px] font-bold uppercase tracking-[0.2em] transition-all rounded-sm flex items-center justify-center gap-2",
                            user.isHidden
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                              : "border-white/10 bg-white/5 text-white/50 hover:bg-white hover:text-black"
                          )}
                        >
                          {user.isHidden ? 'Restore To Team Sync' : 'Hide from Team Sync'}
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id || user.uid)}
                          disabled={isDeleting === (user.id || user.uid)}
                          className={cn(
                            "w-full py-4 border text-[11px] font-bold uppercase tracking-[0.2em] transition-all rounded-sm flex items-center justify-center gap-2",
                            isDeleting === (user.id || user.uid) 
                              ? "bg-red-600 border-red-600 text-white animate-pulse"
                              : "border-red-500/20 bg-red-500/5 text-red-500/60 hover:bg-red-600 hover:text-white hover:border-red-600"
                          )}
                        >
                          {isDeleting === (user.id || user.uid) ? 'DELETING...' : 'Terminate Subject'}
                        </button>
                     </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-12 text-[9px] text-white/10 uppercase tracking-[0.3em] font-bold border-t border-white/5 pt-8 flex items-center justify-between">
         <span>Total Active Nodes: {groupUsers.length}</span>
         <span className="animate-pulse">System Stabilized // No Errors</span>
      </div>
    </div>
  );
}

// --- Sub-Pages ---

function LandingPage({ onLogin, isLoggingIn, error }: { onLogin: (data: { email: string, pass: string, isNew: boolean }) => void, isLoggingIn: boolean, error: string | null }) {
  const [isNewUser, setIsNewUser] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    onLogin({ email, pass: password, isNew: isNewUser });
  };

  return (
    <div className="h-screen w-full bg-black relative flex flex-col items-center justify-center p-6 text-center noise overflow-hidden">
      {/* Background Flares */}
      <div className="absolute inset-0 pointer-events-none liquid-flare opacity-40 z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-vivid-blue/5 blur-[160px] rounded-full pointer-events-none z-0" />

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass p-12 border-white/10 rounded-sm relative z-10 shadow-2xl backdrop-blur-3xl"
      >
        <h1 className="text-2xl font-display uppercase tracking-[0.3em] text-white mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">Team Sync App</h1>
        <p className="text-white/40 mb-10 text-[10px] uppercase font-bold tracking-[0.2em] leading-relaxed">
          Liquid Intelligence / Team Synchronization
        </p>

        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-sm text-[10px] font-bold uppercase tracking-widest leading-relaxed"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 text-left">
          <div>
            <label className="block text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3 ml-1">Identity / Mail</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@domain.com"
              className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-sm focus:outline-none focus:border-white transition-all text-xs text-white"
              required
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3 ml-1">Access / Pass</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-sm focus:outline-none focus:border-white transition-all text-xs text-white"
              required
            />
          </div>
          
          <button 
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-5 bg-white text-black rounded-sm font-bold text-xs uppercase tracking-[0.2em] hover:bg-white/90 transition-all disabled:opacity-50"
          >
            {isLoggingIn ? "Processing..." : (isNewUser ? "Engage Protocol / Sign Up" : "Authenticate / Sign In")}
          </button>

          <div className="flex flex-col items-center gap-3 mt-6">
            <button 
              type="button"
              onClick={() => setIsNewUser(!isNewUser)}
              className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em] hover:text-white transition-colors"
            >
              {isNewUser ? "Active Account? Login" : "New Member? Join"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function Onboarding({ user, onComplete }: any) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    name: user.displayName || '',
    role: '',
    groupName: '',
    groupId: ''
  });

  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

  const next = async () => {
    if (step === 3) {
      setIsValidating(true);
      setError('');
      try {
        const groupId = data.groupName.toLowerCase().replace(/\s+/g, '-');
        const isMaster = groupId === 'talkware2026';
        const isValid = isMaster || await validateTeamCode(groupId);
        if (!isValid) {
          setError('Invalid Access Code. Please contact your administrator.');
          return;
        }
        onComplete({ ...data, groupId, groupName: data.groupName });
      } catch (err: any) {
        setError('Validation failed.');
      } finally {
        setIsValidating(false);
      }
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="h-screen w-full bg-black flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-white/10 p-10 rounded-sm">
         <div className="flex gap-2 mb-12">
            {[1, 2, 3].map(i => (
              <div key={i} className={cn("h-0.5 flex-1", i <= step ? "bg-white" : "bg-white/10")} />
            ))}
         </div>

         <AnimatePresence mode="wait">
           {step === 1 && (
             <motion.div 
               key="step1"
               initial={{ opacity: 0, x: 10 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -10 }}
               className="space-y-8"
             >
               <h2 className="text-xl font-display uppercase tracking-[0.2em] text-white">Identity</h2>
               <div className="space-y-2">
                  <label className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Full Name</label>
                  <input 
                    autoFocus
                    value={data.name} 
                    onChange={e => setData({...data, name: e.target.value})}
                    placeholder="e.g. MORIARTY"
                    className="w-full text-base font-bold p-4 bg-white/5 border border-white/10 rounded-sm focus:outline-none focus:border-white transition-all text-white uppercase tracking-widest"
                  />
               </div>
             </motion.div>
           )}

           {step === 2 && (
             <motion.div 
               key="step2"
               initial={{ opacity: 0, x: 10 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -10 }}
               className="space-y-8"
             >
               <h2 className="text-xl font-display uppercase tracking-[0.2em] text-white">Function</h2>
               <div className="grid grid-cols-2 gap-2">
                  {['Product', 'Engineering', 'Design', 'Development', 'Marketing', 'Systems'].map(r => (
                    <button 
                      key={r}
                      onClick={() => setData({...data, role: r})}
                      className={cn(
                        "p-4 rounded-sm border text-left transition-all uppercase tracking-widest text-[9px] font-bold",
                        data.role === r ? "bg-white border-white text-black" : "bg-black border-white/10 text-white/40 hover:border-white/30"
                      )}
                    >
                      {r}
                    </button>
                  ))}
               </div>
             </motion.div>
           )}

           {step === 3 && (
             <motion.div 
               key="step3"
               initial={{ opacity: 0, x: 10 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -10 }}
               className="space-y-8"
             >
               <h2 className="text-xl font-display uppercase tracking-[0.2em] text-white">Access</h2>
               <div className="space-y-2">
                  <label className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Team Access Code</label>
                  <input 
                    autoFocus
                    value={data.groupName} 
                    onChange={e => setData({...data, groupName: e.target.value})}
                    placeholder="e.g. ALPHA-9"
                    className="w-full text-base font-bold p-4 bg-white/5 border border-white/10 rounded-sm focus:outline-none focus:border-white transition-all text-white uppercase tracking-widest"
                  />
                  {error && <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-2">{error}</p>}
               </div>
             </motion.div>
           )}
         </AnimatePresence>

         <div className="mt-12 flex justify-between items-center">
            <button 
              onClick={() => step > 1 && setStep(s => s - 1)}
              className={cn("text-[9px] font-bold text-white/30 hover:text-white transition-colors uppercase tracking-widest", (step === 1 || isValidating) && "opacity-0 invisible")}
            >
              Previous
            </button>
            <button 
              disabled={step === 1 ? !data.name : step === 2 ? !data.role : (!data.groupName || isValidating)}
              onClick={next}
              className="px-8 py-3 bg-white text-black rounded-sm font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-white/90 disabled:opacity-20 transition-all"
            >
              {step === 3 ? (isValidating ? "Validating..." : "Initialize") : "Proceed"}
            </button>
         </div>
      </div>
    </div>
  );
}

// --- Alignment Search Component ---

function AlignmentSearch({ users, availability, selectedUserIds, viewDate, hours, formatHour }: any) {
  const [selectedHour, setSelectedHour] = useState(hours[0] || 10);
  
  const todayStr = format(viewDate, 'yyyy-MM-dd');
  const relevantUsers = users.filter((u: any) => selectedUserIds.size === 0 || selectedUserIds.has(u.uid));
  
  const availableUsers = useMemo(() => {
    return relevantUsers.filter((u: any) => 
      availability.some((a: any) => a.userId === u.uid && a.date === todayStr && a.startTime === selectedHour * 60 && a.type === 'free')
    );
  }, [relevantUsers, availability, todayStr, selectedHour]);

  const busyUsers = relevantUsers.filter((u: any) => !availableUsers.find((au: any) => au.uid === u.uid));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-grow p-2 bg-white/10 border border-white/20 rounded-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-white/30" />
          <select 
            value={selectedHour}
            onChange={(e) => setSelectedHour(Number(e.target.value))}
            className="bg-transparent text-[10px] font-bold text-white uppercase tracking-widest focus:outline-none w-full"
          >
            {hours.map((h: number) => (
              <option key={h} value={h} className="bg-black">{formatHour(h)} - {formatHour(h + 1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-display font-bold text-white/50 uppercase tracking-[0.2em]">Alignment Status</span>
          <Badge variant={availableUsers.length === relevantUsers.length ? 'success' : 'busy'}>
            {availableUsers.length} / {relevantUsers.length}
          </Badge>
        </div>

        {availableUsers.length === relevantUsers.length ? (
          <div className="p-4 bg-white/5 border border-vivid-blue/20 rounded-sm flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-vivid-blue" />
            <div>
              <p className="text-[9px] font-bold text-vivid-blue uppercase tracking-[0.2em]">Synched</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2">Free</p>
              {availableUsers.slice(0, 3).map((u: any) => (
                <p key={u.uid} className="text-[10px] font-bold text-white/60 truncate uppercase tracking-widest">{u.name}</p>
              ))}
              {availableUsers.length > 3 && <p className="text-[8px] text-white/20 uppercase tracking-widest">+{availableUsers.length - 3} more</p>}
            </div>
            <div className="space-y-1">
              <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Busy</p>
              {busyUsers.slice(0, 3).map((u: any) => (
                <p key={u.uid} className="text-[10px] font-bold text-white/40 truncate uppercase tracking-widest">{u.name}</p>
              ))}
              {busyUsers.length > 3 && <p className="text-[8px] text-white/20 uppercase tracking-widest">+{busyUsers.length - 3} more</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Month Calendar ---

function MonthCalendar({ viewDate, setViewDate, availability, usersCount }: any) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(viewDate));

  useEffect(() => {
    setCurrentMonth(startOfMonth(viewDate));
  }, [viewDate]);
  
  const daysInMonth = useMemo(() => {
    try {
      const start = startOfWeek(startOfMonth(currentMonth));
      const end = endOfWeek(endOfMonth(currentMonth));
      return eachDayOfInterval({ start, end });
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [currentMonth]);

  const availabilityDensity = useMemo(() => {
    if (!availability) return {};
    const density: Record<string, number> = {};
    availability.forEach((a: any) => {
      if (a.type === 'free') {
        density[a.date] = (density[a.date] || 0) + 1;
      }
    });
    return density;
  }, [availability]);

  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-sm p-4 shadow-2xl backdrop-blur-3xl flex flex-col w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/90">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 opacity-60 hover:opacity-100">
            <ChevronLeft className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 opacity-60 hover:opacity-100">
            <ChevronRight className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2 border-b border-white/5 pb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={`${day}-${i}`} className="text-center text-[8px] font-black text-white/20 uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {daysInMonth.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, viewDate);
          const isCurrMonth = isSameMonth(day, currentMonth);
          const density = availabilityDensity[dateStr] || 0;
          const intensity = Math.min(1, density / 40);
          
          return (
            <button
              key={dateStr}
              onClick={() => {
                setViewDate(day);
                if (!isCurrMonth) setCurrentMonth(startOfMonth(day));
              }}
              className={cn(
                "aspect-square rounded-sm flex flex-col items-center justify-center relative transition-all group overflow-hidden border border-transparent",
                isSelected ? "bg-white text-black z-10 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]" : 
                isCurrMonth ? "hover:bg-white/10 text-white/70 hover:border-white/10" : "text-white/10 pointer-events-none opacity-20"
              )}
            >
              {!isSelected && intensity > 0 && (
                <div 
                  className="absolute inset-0 bg-vivid-blue/30 blur-[2px]"
                  style={{ opacity: intensity * 0.4 }}
                />
              )}

              <span className={cn("text-[10px] font-mono font-bold relative z-10", isSelected ? "text-black" : "text-white/80")}>
                {format(day, 'd')}
              </span>
              
              {isToday(day) && !isSelected && (
                <div className="absolute bottom-1 w-1 h-1 bg-vivid-blue rounded-full relative z-10 shadow-[0_0_8px_rgba(125,249,255,1)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- The Matrix View ---

function MatrixView({ users, availability, currentUserId, viewDate, setViewDate, viewMode, setViewMode, direction, userProfile, hours, formatHour, overlaps, selectedUserIds, setSelectedUserIds }: any) {
  const [hoveredSlot, setHoveredSlot] = useState<any>(null);
  
  const toggleUserSelection = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedUserIds(next);
  };

  const toggleAll = () => {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u: any) => u.uid)));
    }
  };

  const todayStr = format(viewDate, 'yyyy-MM-dd');

  const getSlot = (userId: string, hour: number) => {
    return availability.find((a: any) => a.userId === userId && a.date === todayStr && a.startTime === hour * 60);
  };

  const handleSlotClick = async (hour: number, date?: string) => {
    const targetDate = date || todayStr;
    const existing = availability.find((a: any) => a.userId === currentUserId && a.date === targetDate && a.startTime === hour * 60);
    if (existing) {
      await deleteAvailability(existing.id);
    } else {
      await addAvailability({
        groupId: userProfile.groupId,
        date: targetDate,
        startTime: hour * 60,
        duration: 60,
        type: 'free'
      });
    }
  };

  // --- Multi-select Logic ---
  const [dragInfo, setDragInfo] = useState<{ isDragging: boolean, type: 'add' | 'remove' | null, processedHours: Set<number> }>({
    isDragging: false,
    type: null,
    processedHours: new Set()
  });

  const handleMouseDown = async (hour: number) => {
    const existing = getSlot(currentUserId, hour);
    const type = existing ? 'remove' : 'add';
    
    setDragInfo({
      isDragging: true,
      type,
      processedHours: new Set([hour])
    });

    await handleSlotClick(hour);
  };

  const handleMouseEnterCell = async (hour: number, userId: string) => {
    setHoveredSlot({ user: users.find((u: any) => u.uid === userId), h: hour });

    if (dragInfo.isDragging && userId === currentUserId && !dragInfo.processedHours.has(hour)) {
      const existing = getSlot(currentUserId, hour);
      
      if ((dragInfo.type === 'add' && !existing) || (dragInfo.type === 'remove' && existing)) {
        setDragInfo(prev => ({
          ...prev,
          processedHours: new Set([...prev.processedHours, hour])
        }));
        await handleSlotClick(hour);
      }
    }
  };

  const handleMouseUp = () => {
    setDragInfo({ isDragging: false, type: null, processedHours: new Set() });
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const [isCopying, setIsCopying] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const handleDuplicateWeek = async () => {
    setIsCopying(true);
    try {
      await duplicateAvailabilityToWeeks(todayStr, availability, repeatWeeks);
    } finally {
      setIsCopying(false);
    }
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(viewDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [viewDate]);

  const getWeekStats = (userId: string, day: Date) => {
    const dStr = format(day, 'yyyy-MM-dd');
    const userAvail = availability.filter((a: any) => a.userId === userId && a.date === dStr && a.type === 'free');
    return userAvail.length;
  };

  const slideVariants = {
    initial: (dir: number) => ({
      x: dir > 0 ? 50 : -50,
      opacity: 0,
      filter: 'blur(10px)'
    }),
    animate: {
      x: 0,
      opacity: 1,
      filter: 'blur(0px)',
      transition: { 
        x: { type: "spring", stiffness: 350, damping: 30 },
        opacity: { duration: 0.2 }
      }
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -50 : 50,
      opacity: 0,
      filter: 'blur(10px)',
      transition: { 
        x: { type: "spring", stiffness: 350, damping: 30 },
        opacity: { duration: 0.2 }
      }
    })
  };

  return (
    <div className="flex-grow glass border-white/10 rounded-sm flex flex-col overflow-hidden relative shadow-2xl">
      <div className="h-16 bg-white/5 backdrop-blur-3xl border-b border-white/10 px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1">
             <IconButton onClick={() => setViewDate((d: Date) => addDays(d, viewMode === 'day' ? -1 : -7))} className="bg-white/5 border-white/5"><ChevronLeft className="w-4 h-4" /></IconButton>
             <IconButton onClick={() => setViewDate((d: Date) => addDays(d, viewMode === 'day' ? 1 : 7))} className="bg-white/5 border-white/5"><ChevronRight className="w-4 h-4" /></IconButton>
           </div>
           <h2 className="text-[11px] font-display font-bold uppercase tracking-[0.25em] text-white">
             {viewMode === 'day' ? format(viewDate, 'EEEE, MMM do') : `Week of ${format(startOfWeek(viewDate, { weekStartsOn: 1 }), 'MMM do')}`}
             {viewMode === 'day' && isToday(viewDate) && <span className="ml-3 text-vivid-blue font-black tracking-widest brightness-125"> / TODAY</span>}
           </h2>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center bg-white/5 rounded-sm border border-white/10 p-0.5 backdrop-blur-md">
             <button 
               onClick={() => setViewMode('day')}
               className={cn(
                 "px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm",
                 viewMode === 'day' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
               )}
             >
               Day
             </button>
             <button 
               onClick={() => setViewMode('week')}
               className={cn(
                 "px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm",
                 viewMode === 'week' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
               )}
             >
               Week
             </button>
           </div>
           
           <div className="flex items-center bg-white/5 rounded-sm border border-white/10 overflow-hidden backdrop-blur-md">
             <button 
               onClick={handleDuplicateWeek}
               disabled={isCopying}
               className="px-4 py-2 text-white/60 text-[9px] font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all disabled:opacity-50"
             >
               {isCopying ? "SYNCING..." : `Repeat x${repeatWeeks}`}
             </button>
             <select 
               value={repeatWeeks}
               onChange={(e) => setRepeatWeeks(Number(e.target.value))}
               className="bg-black/50 border-l border-white/10 px-2 py-2 text-white/60 text-[9px] font-bold focus:outline-none transition-colors cursor-pointer appearance-none uppercase"
             >
               {[1, 2, 3, 4].map(num => (
                 <option key={num} value={num} className="bg-zinc-900">{num} weeks</option>
               ))}
             </select>
           </div>
          </div>
      </div>

      <div className="flex-grow overflow-hidden relative bg-black/20">
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div 
            key={todayStr}
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 overflow-auto select-none custom-scrollbar"
          >
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur-3xl border-b border-white/10">
                <tr>
                  <th className="w-48 p-4 bg-zinc-950 border-r border-white/10 sticky left-0 z-30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-display font-bold text-white/70 uppercase tracking-[0.2em]">Members</span>
                  <button 
                    onClick={toggleAll}
                    className="text-[8px] font-bold text-white/30 hover:text-white uppercase tracking-widest transition-colors"
                  >
                    {selectedUserIds.size === users.length ? 'None' : 'All'}
                  </button>
                </div>
              </th>
              {viewMode === 'day' ? (
                hours.map(h => (
                  <th key={h} className="p-4 min-w-[80px] border-r border-white/5 text-center bg-white/[0.02]">
                    <p className="text-[10px] font-mono font-black text-white/70 tracking-tighter drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                      {formatHour(h)}
                    </p>
                  </th>
                ))
              ) : (
                weekDays.map(day => (
                  <th key={day.toISOString()} className={cn(
                    "p-4 min-w-[120px] border-r border-white/5 text-center bg-white/[0.02]",
                    isToday(day) && "bg-vivid-blue/5"
                  )}>
                    <p className="text-[8px] font-mono font-black text-white/30 uppercase tracking-widest mb-1">
                      {format(day, 'EEE')}
                    </p>
                    <p className="text-[10px] font-mono font-black text-white/70 tracking-tighter drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                      {format(day, 'MMM d')}
                    </p>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((user: any) => {
              const isSelf = user.uid === currentUserId;
              const isSelected = selectedUserIds.has(user.uid);

              return (
                <tr key={user.uid} className={cn(
                  "group/row border-b border-white/5 transition-colors", 
                  isSelf && "bg-white/5",
                  !isSelected && "opacity-20 grayscale"
                )}>
                  <td 
                    onClick={() => toggleUserSelection(user.uid)}
                    className="p-4 border-r border-white/10 sticky left-0 z-10 bg-black/40 group-hover/row:bg-white/5 transition-colors cursor-pointer backdrop-blur-3xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-3 h-3 rounded-sm border flex items-center justify-center transition-all",
                        isSelected ? "bg-white border-white" : "bg-transparent border-white/20"
                      )}>
                        {isSelected && <div className="w-1.5 h-1.5 bg-black rounded-sm" />}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-[10px] font-bold truncate uppercase tracking-widest", isSelf ? "text-vivid-blue" : "text-white/70")}>
                          {user.name}
                        </p>
                        <p className="text-[8px] text-white/20 uppercase font-bold tracking-[0.15em]">{user.role}</p>
                      </div>
                    </div>
                  </td>
                  {viewMode === 'day' ? (
                    hours.map(h => {
                      const slot = getSlot(user.uid, h);
                      const selectedCount = selectedUserIds.size || users.length;
                      const isOptimal = overlaps[h] >= Math.max(1, Math.ceil(selectedCount * 0.7));

                      return (
                        <td 
                          key={h} 
                          onMouseDown={() => isSelf && handleMouseDown(h)}
                          onMouseEnter={() => handleMouseEnterCell(h, user.uid)}
                          onMouseLeave={() => setHoveredSlot(null)}
                          className={cn(
                            "p-0.5 h-14 border-r border-white/5 transition-all cursor-pointer relative",
                            isSelf ? "hover:bg-white/5" : "cursor-default"
                          )}
                        >
                          <AnimatePresence>
                            {slot && (
                              <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className={cn(
                                  "w-full h-full rounded-sm border flex items-center justify-center transition-all",
                                  slot.type === 'free' ? "bg-vivid-blue border-vivid-blue" : "bg-white/5 border-white/10"
                                )}
                              >
                                 {slot.type === 'free' && isSelf && <CheckCircle2 className="w-3 h-3 text-black" />}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {isOptimal && !slot && (
                             <div className="absolute inset-1 border border-dashed border-vivid-blue/30 rounded-sm" />
                          )}
                          
                          {hoveredSlot?.user.uid === user.uid && hoveredSlot?.h === h && (
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black z-50 shadow-2xl pointer-events-none min-w-[120px] rounded-sm">
                                <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-black/40 mb-1">{formatHour(h)} - {formatHour(h + 1)}</p>
                                <p className="text-[10px] font-bold uppercase tracking-widest">{slot ? 'Available' : 'Unavailable'}</p>
                             </div>
                          )}
                        </td>
                      );
                    })
                  ) : (
                    weekDays.map(day => {
                      const freeCount = getWeekStats(user.uid, day);
                      const isTodayDay = isToday(day);
                      
                      return (
                        <td 
                          key={day.toISOString()}
                          onClick={() => {
                            setViewDate(day);
                            setViewMode('day');
                          }}
                          className={cn(
                            "p-2 h-14 border-r border-white/5 transition-all cursor-pointer relative hover:bg-white/5",
                            isTodayDay && "bg-white/[0.02]"
                          )}
                        >
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                            {freeCount > 0 ? (
                              <>
                                <div 
                                  className="w-full h-1 bg-white/5 rounded-full overflow-hidden relative"
                                >
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(freeCount / hours.length) * 100}%` }}
                                    className="absolute inset-0 bg-vivid-blue shadow-[0_0_10px_rgba(125,249,255,0.5)]"
                                  />
                                </div>
                                <span className="text-[9px] font-mono font-black text-vivid-blue tracking-widest uppercase">
                                  {freeCount}h Free
                                </span>
                              </>
                            ) : (
                              <span className="text-[8px] font-mono font-bold text-white/10 tracking-widest uppercase italic">
                                No Data
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SettingsView({ userProfile, onBack }: { userProfile: any, onBack: () => void }) {
  const [formData, setFormData] = useState({
    name: userProfile.name || '',
    role: userProfile.role || '',
    avatar: userProfile.avatar || '',
    groupId: userProfile.groupId || '',
    notificationsEnabled: userProfile.notificationsEnabled ?? true
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    try {
      if (formData.groupId !== userProfile.groupId) {
        const isMaster = formData.groupId === 'talkware2026';
        const isValid = isMaster || await validateTeamCode(formData.groupId);
        if (!isValid) {
          throw new Error('Invalid Team Access Code. Please check with your administrator.');
        }
      }
      await updateProfile(userProfile.uid, formData);
      setMessage('Profile updated successfully.');
      setTimeout(onBack, 1500);
    } catch (err: any) {
      setMessage('Update failed: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-screen w-full bg-black flex flex-col p-8 sm:p-16 overflow-hidden relative selection:bg-vivid-blue selection:text-black">
      <div className="absolute inset-0 pointer-events-none noise opacity-20" />
      <div className="absolute inset-0 pointer-events-none liquid-flare opacity-40 z-0" />

      <div className="max-w-2xl w-full mx-auto relative z-10 flex flex-col h-full">
        <header className="flex items-center justify-between mb-12">
          <div>
            <div className="flex items-center gap-4 mb-4">
               <div className="w-12 h-1 bg-vivid-blue" />
               <span className="text-[10px] font-black tracking-[0.3em] text-vivid-blue uppercase">Profile</span>
            </div>
            <h1 className="text-3xl font-display uppercase tracking-[0.4em] text-white">Settings</h1>
          </div>
          <IconButton onClick={onBack} tooltip="Back to Dashboard">
            <ChevronLeft className="w-4 h-4" />
          </IconButton>
        </header>

        <form onSubmit={handleSave} className="space-y-8 flex-grow overflow-y-auto custom-scrollbar pr-4 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Full Name</label>
              <input 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full p-4 bg-zinc-900/50 border border-white/10 rounded-sm focus:border-vivid-blue/50 focus:outline-none transition-all text-xs font-mono uppercase tracking-widest text-white"
                placeholder="OPERATOR NAME"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Current Role</label>
              <input 
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value})}
                className="w-full p-4 bg-zinc-900/50 border border-white/10 rounded-sm focus:border-vivid-blue/50 focus:outline-none transition-all text-xs font-mono uppercase tracking-widest text-white"
                placeholder="e.g. SYSTEMS / ARCHITECT"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Avatar URL</label>
            <input 
              value={formData.avatar} 
              onChange={e => setFormData({...formData, avatar: e.target.value})}
              className="w-full p-4 bg-zinc-900/50 border border-white/10 rounded-sm focus:border-vivid-blue/50 focus:outline-none transition-all text-xs font-mono uppercase tracking-widest text-white"
              placeholder="https://..."
            />
          </div>

          <div className="p-8 bg-vivid-blue/5 border border-vivid-blue/20 rounded-sm space-y-4">
             <div className="flex items-center justify-between">
                <div>
                   <h3 className="text-xs font-display uppercase tracking-widest text-vivid-blue mb-1">Team Access Code</h3>
                   <p className="text-[9px] text-vivid-blue/40 uppercase font-black">Warning: Changing this moves you to a different shared network. Must be authorized by admin.</p>
                </div>
             </div>
             <input 
              value={formData.groupId} 
              onChange={e => setFormData({...formData, groupId: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
              className="w-full p-4 bg-black/40 border border-vivid-blue/20 rounded-sm focus:border-vivid-blue/60 focus:outline-none transition-all text-xs font-mono uppercase tracking-[0.3em] text-vivid-blue"
              placeholder="TEAM-CODE"
            />
          </div>

          {message && (
            <p className={cn(
              "text-[10px] font-black uppercase tracking-[0.3em] text-center",
              message.includes('failed') ? "text-red-500" : "text-emerald-500"
            )}>
              {message}
            </p>
          )}

          <div className="pt-8">
            <button 
              type="submit"
              disabled={isSaving}
              className="w-full py-5 bg-white text-black font-black text-xs uppercase tracking-[0.4em] rounded-sm hover:invert transition-all disabled:opacity-50"
            >
              {isSaving ? "Syncing..." : "Update Protocol"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
