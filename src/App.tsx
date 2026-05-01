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
  ArrowRight
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
  isSameMonth
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
  duplicateAvailabilityToWeeks
} from './lib/firebaseService';

// --- Shared Components ---

const IconButton = ({ children, className, onClick, tooltip }: any) => (
  <button 
    onClick={onClick}
    className={cn(
      "p-2 bg-white border border-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors group relative",
      className
    )}
  >
    {children}
    {tooltip && (
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {tooltip}
      </span>
    )}
  </button>
);

const Badge = ({ children, variant = 'default' }: any) => (
  <span className={cn(
    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest",
    variant === 'default' ? "bg-slate-100 text-slate-500" : 
    variant === 'success' ? "bg-emerald-100 text-emerald-700" :
    variant === 'busy' ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-400"
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
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

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
  }, [userProfile?.groupId]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);

  const hours = useMemo(() => Array.from({ length: 15 }).map((_, i) => i + 7), []); // 7 AM to 10 PM
  const todayStr = format(viewDate, 'yyyy-MM-dd');

  const overlaps = useMemo(() => {
    const counts: Record<number, number> = {};
    hours.forEach(h => {
      counts[h] = groupAvailability.filter((a: any) => 
        a.date === todayStr && 
        a.startTime === h * 60 && 
        a.type === 'free' &&
        (selectedUserIds.size === 0 || selectedUserIds.has(a.userId))
      ).length;
    });
    return counts;
  }, [groupAvailability, todayStr, hours, selectedUserIds]);

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
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" 
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

  return (
    <div className="w-full h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 z-40">
        <div className="flex items-center gap-4">
           <h1 className="text-sm font-black uppercase tracking-widest hidden sm:block">Sync Team</h1>
        </div>

        <div className="flex items-center gap-2">
          <button 
             onClick={() => setShowMobileCalendar(true)}
             className="xl:hidden p-2 text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <CalendarIcon className="w-5 h-5" />
          </button>
          <div className="text-right mr-2 hidden md:block">
            <p className="text-xs font-bold leading-tight">{userProfile.name}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
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
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowMobileCalendar(false)}
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm"
            >
               <MonthCalendar 
                viewDate={viewDate} 
                setViewDate={(d: Date) => { setViewDate(d); setShowMobileCalendar(false); }} 
                availability={groupAvailability} 
                usersCount={groupUsers.length}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-grow flex p-4 sm:p-6 gap-6 overflow-hidden">
        <aside className="w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto scrollbar-hide hidden xl:flex">
          <MonthCalendar 
            viewDate={viewDate} 
            setViewDate={setViewDate} 
            availability={groupAvailability} 
            usersCount={groupUsers.length}
          />
          
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Availability Legend</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-emerald-400" />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Free / Optimal</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm border-2 border-dashed border-emerald-200" />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Recommended Slot</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-orange-100" />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Busy / Conflict</span>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-slate-100">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Quick Shortcuts</h3>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setViewDate(new Date())}
                  className="px-3 py-2 bg-slate-50 text-[10px] font-bold rounded-lg border border-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                  Go to Today
                </button>
                <button 
                  onClick={() => setViewDate(addWeeks(viewDate, 1))}
                  className="px-3 py-2 bg-slate-50 text-[10px] font-bold rounded-lg border border-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                  Next Week
                </button>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Find Alignment</h3>
               <AlignmentSearch 
                 users={groupUsers} 
                 availability={groupAvailability} 
                 selectedUserIds={selectedUserIds}
                 viewDate={viewDate}
               />
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100">
               <div className="space-y-4">
                  {Object.entries(overlaps).filter(([_, count]) => (count as number) > 0).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).slice(0, 3).map(([h, count]) => (
                    <div key={h} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-emerald-500" />
                        <span className="text-[11px] font-bold text-slate-700">{h}:00 - {Number(h) + 1}:00</span>
                      </div>
                      <Badge variant={(count as number) >= (selectedUserIds.size || groupUsers.length) * 0.7 ? "success" : "busy"}>
                        {count} / {selectedUserIds.size || groupUsers.length} Free
                      </Badge>
                    </div>
                  ))}
                  {Object.values(overlaps).every(c => (c as number) === 0) && (
                    <p className="text-[10px] text-slate-400 font-medium italic">No availability set for this day.</p>
                  )}
               </div>
            </div>
          </div>
        </aside>

        <MatrixView 
          users={groupUsers} 
          availability={groupAvailability} 
          currentUserId={fUser.uid} 
          viewDate={viewDate}
          setViewDate={setViewDate}
          userProfile={userProfile}
          hours={hours}
          overlaps={overlaps}
          selectedUserIds={selectedUserIds}
          setSelectedUserIds={setSelectedUserIds}
        />
      </main>
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
    <div className="h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-indigo-100"
      >
        <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Sync Your Team</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          The collaborative availability matrix for high-performing teams.
        </p>

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-bold leading-relaxed"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
              required
            />
          </div>
          
          <button 
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {isLoggingIn ? "Processing..." : (isNewUser ? "Create Account" : "Sign In")}
          </button>

          <div className="flex flex-col items-center gap-3 mt-4">
            <button 
              type="button"
              onClick={() => setIsNewUser(!isNewUser)}
              className="text-slate-400 text-sm font-medium hover:text-indigo-600 transition-colors"
            >
              {isNewUser ? "Already have an account? Sign in" : "Need an account? Sign up"}
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

  const next = () => {
    if (step === 3) {
      const groupId = data.groupName.toLowerCase().replace(/\s+/g, '-');
      onComplete({ ...data, groupId });
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="h-screen w-full bg-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
         <div className="flex gap-2 mb-12">
            {[1, 2, 3].map(i => (
              <div key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-indigo-600" : "bg-slate-100")} />
            ))}
         </div>

         <AnimatePresence mode="wait">
           {step === 1 && (
             <motion.div 
               key="step1"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="space-y-6"
             >
               <h2 className="text-3xl font-bold tracking-tight">What should we call you?</h2>
               <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Name</label>
                  <input 
                    autoFocus
                    value={data.name} 
                    onChange={e => setData({...data, name: e.target.value})}
                    placeholder="Amara Singh"
                    className="w-full text-xl font-medium p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all"
                  />
               </div>
             </motion.div>
           )}

           {step === 2 && (
             <motion.div 
               key="step2"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="space-y-6"
             >
               <h2 className="text-3xl font-bold tracking-tight">What's your role?</h2>
               <div className="grid grid-cols-2 gap-3">
                  {['Product Manager', 'Eng Lead', 'Designer', 'Developer', 'Marketing', 'QA'].map(r => (
                    <button 
                      key={r}
                      onClick={() => setData({...data, role: r})}
                      className={cn(
                        "p-4 rounded-2xl border text-left transition-all",
                        data.role === r ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white border-slate-100 hover:border-indigo-300"
                      )}
                    >
                      <span className="text-sm font-bold">{r}</span>
                    </button>
                  ))}
               </div>
             </motion.div>
           )}

           {step === 3 && (
             <motion.div 
               key="step3"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="space-y-6"
             >
               <h2 className="text-3xl font-bold tracking-tight">Join a Group</h2>
               <p className="text-slate-500">Groups represent departments like "Marketing Team" or "Backend Eng".</p>
               <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Group Name</label>
                  <input 
                    autoFocus
                    value={data.groupName} 
                    onChange={e => setData({...data, groupName: e.target.value})}
                    placeholder="e.g. Design Ops"
                    className="w-full text-xl font-medium p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all"
                  />
               </div>
             </motion.div>
           )}
         </AnimatePresence>

         <div className="mt-12 flex justify-between items-center">
            <button 
              onClick={() => step > 1 && setStep(s => s - 1)}
              className={cn("text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors", step === 1 && "opacity-0 invisible")}
            >
              Go Back
            </button>
            <button 
              disabled={step === 1 ? !data.name : step === 2 ? !data.role : !data.groupName}
              onClick={next}
              className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {step === 3 ? "Complete Profile" : "Continue"}
            </button>
         </div>
      </div>
    </div>
  );
}

// --- Alignment Search Component ---

function AlignmentSearch({ users, availability, selectedUserIds, viewDate }: any) {
  const [selectedHour, setSelectedHour] = useState(10);
  
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
        <div className="flex-grow p-2 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <select 
            value={selectedHour}
            onChange={(e) => setSelectedHour(Number(e.target.value))}
            className="bg-transparent text-xs font-bold focus:outline-none w-full"
          >
            {Array.from({ length: 15 }).map((_, i) => (
              <option key={i + 7} value={i + 7}>{i + 7}:00 - {i + 8}:00</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alignment Status</span>
          <Badge variant={availableUsers.length === relevantUsers.length ? 'success' : 'busy'}>
            {availableUsers.length} / {relevantUsers.length}
          </Badge>
        </div>

        {availableUsers.length === relevantUsers.length ? (
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center text-white">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-tight">Full Alignment</p>
              <p className="text-[10px] text-emerald-600 font-medium">Everyone selected is free!</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Free</p>
              {availableUsers.slice(0, 3).map((u: any) => (
                <p key={u.uid} className="text-[10px] font-bold text-slate-600 truncate">{u.name}</p>
              ))}
              {availableUsers.length > 3 && <p className="text-[9px] text-slate-400">+{availableUsers.length - 3} more</p>}
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1">Busy</p>
              {busyUsers.slice(0, 3).map((u: any) => (
                <p key={u.uid} className="text-[10px] font-bold text-slate-600 truncate">{u.name}</p>
              ))}
              {busyUsers.length > 3 && <p className="text-[9px] text-slate-400">+{busyUsers.length - 3} more</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Month Calendar Component ---

function MonthCalendar({ viewDate, setViewDate, availability, usersCount }: any) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(viewDate));
  
  const daysInMonth = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = startOfWeek(addWeeks(endOfMonth(currentMonth), 1));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const availabilityDensity = useMemo(() => {
    const density: Record<string, number> = {};
    availability.forEach((a: any) => {
      if (a.type === 'free') {
        density[a.date] = (density[a.date] || 0) + 1;
      }
    });
    return density;
  }, [availability]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/50">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-slate-900 tracking-tight">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1">
            <ChevronLeft className="w-3 h-3" />
          </IconButton>
          <IconButton onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1">
            <ChevronRight className="w-3 h-3" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
          <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {daysInMonth.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, viewDate);
          const isCurrMonth = isSameMonth(day, currentMonth);
          const density = availabilityDensity[dateStr] || 0;
          const maxPossibleDensity = usersCount * 15; // Rough estimate of max slots
          const intensity = Math.min(1, density / 40); // 40 free slots = max intensity visual
          
          return (
            <button
              key={dateStr}
              onClick={() => {
                setViewDate(day);
                if (!isCurrMonth) setCurrentMonth(startOfMonth(day));
              }}
              className={cn(
                "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all group overflow-hidden",
                isSelected ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105 z-10" : 
                isCurrMonth ? "hover:bg-slate-50 text-slate-700" : "text-slate-300 pointer-events-none opacity-30"
              )}
            >
              {!isSelected && intensity > 0 && (
                <div 
                  className="absolute inset-x-0 bottom-0 bg-emerald-400/20"
                  style={{ height: `${intensity * 100}%` }}
                />
              )}

              <span className={cn("text-xs font-bold relative z-10", isSelected ? "text-white" : "text-slate-900")}>
                {format(day, 'd')}
              </span>
              
              {!isSelected && intensity > 0 && (
                <div 
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500 relative z-10"
                  style={{ opacity: intensity + 0.3 }}
                />
              )}
              
              {isToday(day) && !isSelected && (
                <div className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-indigo-600 relative z-10" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- The Matrix View ---

function MatrixView({ users, availability, currentUserId, viewDate, setViewDate, userProfile, hours, overlaps, selectedUserIds, setSelectedUserIds }: any) {
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

  const handleSlotClick = async (hour: number) => {
    const existing = getSlot(currentUserId, hour);
    if (existing) {
      await deleteAvailability(existing.id);
    } else {
      await addAvailability({
        groupId: userProfile.groupId,
        date: todayStr,
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

    // Execute first toggle
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

  return (
    <div className="flex-grow bg-white border border-slate-200 rounded-3xl flex flex-col overflow-hidden shadow-xl shadow-slate-200/50 relative">
      <div className="h-16 bg-slate-50/50 border-b border-slate-100 px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1">
             <IconButton onClick={() => setViewDate((d: Date) => addDays(d, -1))}><ChevronLeft className="w-4 h-4" /></IconButton>
             <IconButton onClick={() => setViewDate((d: Date) => addDays(d, 1))}><ChevronRight className="w-4 h-4" /></IconButton>
           </div>
           <h2 className="text-lg font-bold tracking-tight">
             {format(viewDate, 'EEEE, MMM do')}
             {isToday(viewDate) && <span className="ml-2 text-indigo-600 font-normal"> (Today)</span>}
           </h2>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex items-center bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">
             <button 
               onClick={handleDuplicateWeek}
               disabled={isCopying}
               className="px-4 py-2 text-indigo-600 text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2 disabled:opacity-50"
             >
               {isCopying ? "Copying..." : `Repeat for ${repeatWeeks} Week${repeatWeeks > 1 ? 's' : ''}`}
               <CalendarIcon className="w-3 h-3" />
             </button>
             <select 
               value={repeatWeeks}
               onChange={(e) => setRepeatWeeks(Number(e.target.value))}
               className="bg-indigo-50 border-l border-indigo-100 px-2 py-2 text-indigo-600 text-[10px] font-bold focus:outline-none hover:bg-indigo-100 transition-colors cursor-pointer appearance-none"
             >
               {[1, 2, 3, 4].map(num => (
                 <option key={num} value={num}>{num}w</option>
               ))}
             </select>
           </div>
           <Badge variant="success">Team Overlap</Badge>
        </div>
      </div>

      <div className="flex-grow overflow-auto scrollbar-hide select-none">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-white shadow-sm shadow-slate-100">
            <tr>
              <th className="w-48 p-4 bg-white border-r border-slate-100 sticky left-0 z-30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Members</span>
                  <button 
                    onClick={toggleAll}
                    className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-tight"
                  >
                    {selectedUserIds.size === users.length ? 'None' : 'All'}
                  </button>
                </div>
              </th>
              {hours.map(h => (
                <th key={h} className="p-4 min-w-[80px] border-r border-slate-50 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                    {h}:00
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user: any) => {
              const isSelf = user.uid === currentUserId;
              const isSelected = selectedUserIds.has(user.uid);

              return (
                <tr key={user.uid} className={cn(
                  "group/row border-b border-slate-50 transition-colors", 
                  isSelf && "bg-indigo-50/20",
                  !isSelected && "opacity-40 grayscale-[0.5]"
                )}>
                  <td 
                    onClick={() => toggleUserSelection(user.uid)}
                    className="p-4 border-r border-slate-100 sticky left-0 z-10 bg-white group-hover/row:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                        isSelected ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-200"
                      )}>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-xs font-bold truncate", isSelf ? "text-indigo-600" : "text-slate-800")}>
                          {user.name} {isSelf && "(You)"}
                        </p>
                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">{user.role}</p>
                      </div>
                    </div>
                  </td>
                  {hours.map(h => {
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
                          "p-1 h-14 border-r border-slate-50 transition-all cursor-pointer relative",
                          isSelf ? "hover:bg-indigo-50" : "cursor-default"
                        )}
                      >
                        <AnimatePresence>
                          {slot && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className={cn(
                                "w-full h-full rounded-lg border flex items-center justify-center shadow-sm transition-all",
                                slot.type === 'free' ? "bg-emerald-400 border-emerald-500 shadow-emerald-100" : "bg-orange-100 border-orange-200"
                              )}
                            >
                               {slot.type === 'free' && isSelf && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {isOptimal && !slot && (
                           <div className="absolute inset-2 border-2 border-dashed border-emerald-200 rounded-lg flex items-center justify-center">
                              <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-tighter">Ideal</span>
                           </div>
                        )}
                        
                        {hoveredSlot?.user.uid === user.uid && hoveredSlot?.h === h && (
                           <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white rounded-lg z-50 shadow-2xl pointer-events-none min-w-[120px]">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{h}:00 - {h + 1}:00</p>
                              <p className="text-xs font-bold">{slot ? 'Available' : 'Unavailable'}</p>
                           </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
