'use client';

import { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { supabase } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Image from 'next/image';

// LiveKit (음성 채팅) 관련 임포트
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';

const GAME_CLASSES = [
  "전사", "대검전사", "검술사",
  "궁수", "석궁사수", "장궁병",
  "마법사", "화염술사", "빙결술사", "전격술사",
  "힐러", "사제", "수도사", "암흑술사",
  "음유시인", "댄서", "악사",
  "도적", "격투가", "듀얼블레이드"
];

const CLASS_IMAGES: { [key: string]: string } = {
  "전사": "/class-icons/warrior.png", "대검전사": "/class-icons/greatsword.png", "검술사": "/class-icons/blader.png",
  "궁수": "/class-icons/archer.png", "석궁사수": "/class-icons/crossbow.png", "장궁병": "/class-icons/longbow.png",
  "마법사": "/class-icons/mage.png", "화염술사": "/class-icons/fire-wizard.png", "빙결술사": "/class-icons/ice-wizard.png", "전격술사": "/class-icons/lightning-wizard.png",
  "힐러": "/class-icons/healer.png", "사제": "/class-icons/priest.png", "수도사": "/class-icons/monk.png", "암흑술사": "/class-icons/warlock.png",
  "음유시인": "/class-icons/bard.png", "댄서": "/class-icons/dancer.png", "악사": "/class-icons/musician.png",
  "도적": "/class-icons/rogue.png", "격투가": "/class-icons/fighter.png", "듀얼블레이드": "/class-icons/dualblade.png"
};

// ★ 던전 목록 기본값
//   DB(dungeons 테이블)에 데이터가 없거나 조회에 실패했을 때만 사용됩니다.
//   실제 목록은 사이트 내 '던전 목록 관리'에서 수정/추가할 수 있습니다.
const DEFAULT_DUNGEON_DATA: { [key: string]: string[] } = {
  abyss: ["입문", "어려움", "매우 어려움", ...Array.from({ length: 10 }, (_, i) => `지옥 ${i + 1}단계`)],
  raid: ["글라스기브넨 [입문]", "글라스기브넨 [어려움]", "글라스기브넨 [매우 어려움]", "화이트서큐버스", "타바르타스 [입문]", "타바르타스 [어려움]"]
};

const TYPE_TAG: { [key: string]: string } = { abyss: '[어비스]', raid: '[레이드]' };

const Icons = {
  Home: () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/></svg>),
  Calendar: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>),
  Chart: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>),
  Board: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>),
  Trash: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>),
  Close: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>),
  Edit: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>),
  Logout: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>),
  Plus: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>),
  GoogleCal: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="M10 16h4"></path><path d="M12 14v4"></path></svg>),
  UserGroup: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>),
  Camera: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>),
  Admin: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>),
  Mic: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>),
  Crown: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg>),
  Clip: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>),
  Download: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>),
  File: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>)
};

function VoiceChatRoom({ user, roomName }: { user: any, roomName: string }) {
  const [token, setToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const username = user.user_metadata.full_name || 'Guest';
        const resp = await fetch(`/api/livekit?room=${roomName}&username=${username}`);
        if (!resp.ok) {
          const errData = await resp.json();
          throw new Error(errData.error || '토큰 발급 실패');
        }
        const data = await resp.json();
        setToken(data.token);
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e.message || "알 수 없는 오류");
      }
    })();
  }, [roomName, user]);

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#e0526a] gap-4 p-4 text-center">
        <div className="text-3xl">⚠️</div>
        <div className="font-bold">연결 실패</div>
        <div className="text-sm bg-[#fff1f4] p-2 rounded text-[#b32f47]">{errorMsg}</div>
        <p className="text-xs text-[#6d94ac]">관리자에게 문의하세요 (API 키 확인 필요)</p>
      </div>
    );
  }

  if (token === "") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6d94ac] gap-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#17a2d9]"></div>
        <span>입장권 확인 중...</span>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={false}
      audio={true}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      data-lk-theme="default"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div className="flex-1 p-4 overflow-y-auto bg-[#0d3c52] rounded-t-3xl">
        <MyVideoConference />
      </div>
      <ControlBar /> 
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function MyVideoConference() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} style={{ height: '100%' }}>
      <ParticipantTile />
    </GridLayout>
  );
}

export default function RaidScheduler() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [raids, setRaids] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'calendar' | 'stats' | 'board' | 'admin' | 'voice'>('home');
  const calendarRef = useRef<FullCalendar>(null);
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newClass, setNewClass] = useState(GAME_CLASSES[0]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [raidTitle, setRaidTitle] = useState('');
  const [raidType, setRaidType] = useState<'abyss' | 'raid'>('abyss');
  const [selectedDungeon, setSelectedDungeon] = useState('');
  const [maxMembers, setMaxMembers] = useState(4);

  // ★ 모바일 홈 화면용: 일정별 참가 인원수
  const [raidCounts, setRaidCounts] = useState<{ [key: string]: number }>({});

  // ★ 던전 목록 관리용 상태
  const [dungeons, setDungeons] = useState<any[]>([]);
  const [isDungeonModalOpen, setIsDungeonModalOpen] = useState(false);
  const [dungeonTab, setDungeonTab] = useState<'abyss' | 'raid'>('abyss');
  const [newDungeonName, setNewDungeonName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRaid, setSelectedRaid] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [statsData, setStatsData] = useState<any[]>([]);
  const [statsFilter, setStatsFilter] = useState<'all' | 'abyss' | 'raid'>('all');
  const [posts, setPosts] = useState<any[]>([]);
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [voiceRoomName, setVoiceRoomName] = useState('guild-lobby');
  
  const [viewImage, setViewImage] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);
  useEffect(() => {
    if (activeTab === 'stats') fetchStats();
    if (activeTab === 'board') fetchPosts();
    if (activeTab === 'admin') fetchAllProfiles();
  }, [activeTab, statsFilter]);

  // ★ 현재 사용할 던전 이름 목록 (DB 우선, 없으면 기본값)
  const dungeonList = (type: 'abyss' | 'raid'): string[] => {
    const rows = dungeons.filter(d => d.type === type);
    if (rows.length > 0) return rows.map(d => d.name);
    return DEFAULT_DUNGEON_DATA[type];
  };

  useEffect(() => {
    if (isCreateModalOpen) setSelectedDungeon(dungeonList(raidType)[0] || '');
  }, [raidType, isCreateModalOpen, dungeons]);

  const initialize = async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { setUser(session.user); await loadProfile(session.user.id); }
    await fetchRaids();
    await fetchRaidCounts();
    await fetchDungeons();
    setIsLoading(false);
  };

  const loadProfile = async (userId: string) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profile) {
      setMyProfile(profile);
      if (profile.role === 'admin') setIsAdmin(true);
    } else {
      setIsProfileModalOpen(true);
    }
  };

  const fetchAllProfiles = async () => { const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); if (data) setAllProfiles(data); };
  const handleDeleteMember = async (memberId: string, memberName: string) => { if (!confirm(`정말 '${memberName}' 회원을 강퇴하시겠습니까?`)) return; await supabase.from('profiles').delete().eq('id', memberId); alert("삭제되었습니다."); fetchAllProfiles(); };
  const handleLogin = async () => { await supabase.auth.signInWithOAuth({ provider: 'google', options: { queryParams: { access_type: 'offline', prompt: 'consent' } } }); };
  const handleLogout = async () => { await supabase.auth.signOut(); window.location.reload(); };
  const handleSaveProfile = async () => { if (!newNickname) return alert("입력해주세요!"); const newProfile = { id: user.id, nickname: newNickname, game_class: newClass }; const { error } = await supabase.from('profiles').upsert([newProfile]); if (!error) { setMyProfile(newProfile); setIsProfileModalOpen(false); } };
  const openEditProfile = () => { if (myProfile) { setNewNickname(myProfile.nickname); setNewClass(myProfile.game_class); } setIsProfileModalOpen(true); };
  
  const fetchRaids = async () => { const { data } = await supabase.from('raids').select('*'); if (data) { setRaids(data.map((raid) => ({ id: raid.id, title: raid.title, date: raid.start_time.split('T')[0], created_by_email: raid.created_by_email, host_name: raid.host_name, host_avatar: raid.host_avatar, max_members: raid.max_members, backgroundColor: raid.title.includes('어비스') || raid.title.includes('지옥') ? '#bfe6f7' : '#ffd3da', borderColor: 'transparent' }))); } };
  const fetchStats = async () => { const { data: participants } = await supabase.from('participants').select('user_name, game_class, raids (title)'); if (participants) { const countMap: { [key: string]: { count: number; job: string } } = {}; participants.forEach((p: any) => { const raidTitle = p.raids?.title || ""; if (statsFilter === 'abyss' && !raidTitle.includes('어비스') && !raidTitle.includes('지옥')) return; if (statsFilter === 'raid' && !raidTitle.includes('레이드')) return; if (countMap[p.user_name]) countMap[p.user_name].count += 1; else countMap[p.user_name] = { count: 1, job: p.game_class || '모험가' }; }); const chartData = Object.keys(countMap).map((name) => ({ name: name, count: countMap[name].count, job: countMap[name].job })).sort((a, b) => b.count - a.count); setStatsData(chartData); } };
  const fetchPosts = async () => { const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }); if (data) setPosts(data); };

  // ★ 일정별 참가 인원수 (모바일 홈/일정 카드에 표시)
  const fetchRaidCounts = async () => {
    const { data } = await supabase.from('participants').select('raid_id');
    if (!data) return;
    const map: { [key: string]: number } = {};
    data.forEach((p: any) => { map[p.raid_id] = (map[p.raid_id] || 0) + 1; });
    setRaidCounts(map);
  };

  // ★ 목록 카드에서 상세 모달 열기 (캘린더 클릭과 동일한 동작)
  const openRaidDetail = async (raid: any) => {
    const { data } = await supabase.from('participants').select('*').eq('raid_id', raid.id);
    setSelectedRaid({
      id: raid.id, title: raid.title, date: raid.date,
      created_by_email: raid.created_by_email, max_members: raid.max_members || 4,
      host_name: raid.host_name, host_avatar: raid.host_avatar,
    });
    setParticipants(data || []);
    setIsDetailModalOpen(true);
  };

  // ================= ★ 던전 목록 관리 =================
  const fetchDungeons = async () => {
    const { data, error } = await supabase
      .from('dungeons')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) { console.error('던전 목록 조회 실패(기본값 사용):', error.message); return; }
    if (data) setDungeons(data);
  };

  // 처음 한 번: 기본 던전 목록을 DB에 밀어넣기
  const handleSeedDungeons = async () => {
    if (!confirm('기본 던전 목록을 DB에 저장할까요?\n(최초 1회만 실행하세요)')) return;
    const rows: any[] = [];
    (['abyss', 'raid'] as const).forEach(type => {
      DEFAULT_DUNGEON_DATA[type].forEach((name, i) => rows.push({ type, name, sort_order: i + 1 }));
    });
    const { error } = await supabase.from('dungeons').insert(rows);
    if (error) return alert('저장 실패: ' + error.message);
    await fetchDungeons();
  };

  const handleAddDungeon = async () => {
    const name = newDungeonName.trim();
    if (!name) return alert('던전 이름을 입력해주세요.');
    if (dungeons.some(d => d.type === dungeonTab && d.name === name)) return alert('이미 같은 이름의 던전이 있습니다.');
    const maxOrder = dungeons.filter(d => d.type === dungeonTab).reduce((m, d) => Math.max(m, d.sort_order ?? 0), 0);
    const { error } = await supabase.from('dungeons').insert([{ type: dungeonTab, name, sort_order: maxOrder + 1 }]);
    if (error) return alert('추가 실패: ' + error.message);
    setNewDungeonName('');
    await fetchDungeons();
  };

  const handleRenameDungeon = async (row: any) => {
    const name = editingName.trim();
    if (!name) return alert('이름을 입력해주세요.');
    if (name === row.name) { setEditingId(null); setEditingName(''); return; }
    if (dungeons.some(d => d.type === row.type && d.name === name)) return alert('이미 같은 이름의 던전이 있습니다.');

    const { error } = await supabase.from('dungeons').update({ name }).eq('id', row.id);
    if (error) return alert('수정 실패: ' + error.message);

    // 이미 등록된 일정 제목도 함께 바꿀지 물어보기
    const tag = TYPE_TAG[row.type];
    const oldTitle = `${tag} ${row.name}`;
    const newTitle = `${tag} ${name}`;
    if (confirm(`이미 캘린더에 등록된 "${oldTitle}" 일정의 제목도\n"${newTitle}" 로 함께 변경할까요?`)) {
      await supabase.from('raids').update({ title: newTitle }).eq('title', oldTitle);
      await fetchRaids();
    }

    setEditingId(null); setEditingName('');
    await fetchDungeons();
  };

  const handleDeleteDungeon = async (row: any) => {
    if (!confirm(`'${row.name}' 던전을 목록에서 삭제할까요?\n(이미 등록된 일정은 그대로 남습니다)`)) return;
    const { error } = await supabase.from('dungeons').delete().eq('id', row.id);
    if (error) return alert('삭제 실패: ' + error.message);
    await fetchDungeons();
  };

  const openDungeonModal = () => {
    setDungeonTab(raidType);
    setEditingId(null);
    setEditingName('');
    setNewDungeonName('');
    setIsDungeonModalOpen(true);
  };
  // ====================================================
  
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; setSelectedImage(file); setPreviewUrl(URL.createObjectURL(file)); } };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { setSelectedFile(e.target.files[0]); } };

  const handleWritePost = async () => {
    if (!postTitle || !postContent) return alert("제목과 내용을 입력해주세요.");
    setUploading(true); 
    let imageUrl = null;
    let fileUrl = null;
    let fileNameStr = null;

    try {
      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop(); const imgName = `img_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('images').upload(imgName, selectedImage);
        if (uploadError) throw uploadError; const { data } = supabase.storage.from('images').getPublicUrl(imgName); imageUrl = data.publicUrl;
      }
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop(); const fName = `file_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('files').upload(fName, selectedFile);
        if (uploadError) throw uploadError; const { data } = supabase.storage.from('files').getPublicUrl(fName); fileUrl = data.publicUrl; fileNameStr = selectedFile.name;
      }
      await supabase.from('posts').insert([{ title: postTitle, content: postContent, author_name: myProfile.nickname, author_class: myProfile.game_class, user_id: user.id, image_url: imageUrl, file_url: fileUrl, file_name: fileNameStr }]);
      setPostTitle(''); setPostContent(''); setSelectedImage(null); setPreviewUrl(''); setSelectedFile(null); setIsWriteModalOpen(false); fetchPosts();
    } catch (error) { console.error(error); alert("오류 발생"); } finally { setUploading(false); }
  };

  const handleDeletePost = async (postId: number) => { if (!confirm("삭제하시겠습니까?")) return; await supabase.from('posts').delete().eq('id', postId); fetchPosts(); };
  
  // ★ FAB 버튼 클릭 시 (오늘 날짜로 모달 열기)
  const openCreateModal = () => { 
    if (!selectedDate) setSelectedDate(new Date().toISOString().split('T')[0]);
    setIsCreateModalOpen(true); 
  };

  const handleCreate = async () => { 
    if (!selectedDungeon) return alert('던전 선택!'); const typeTag = raidType === 'abyss' ? '[어비스]' : '[레이드]'; const finalTitle = `${typeTag} ${selectedDungeon}`; 
    const { data: newRaid, error } = await supabase.from('raids').insert([{ title: finalTitle, start_time: selectedDate, created_by_email: user.email, max_members: maxMembers, host_name: myProfile?.nickname || '알수없음', host_avatar: myProfile?.game_class || '모험가' }]).select().single();
    if (newRaid) { await supabase.from('participants').insert([{ raid_id: newRaid.id, user_name: myProfile.nickname, game_class: myProfile.game_class, user_avatar: user.user_metadata.avatar_url, user_email: user.email }]); }
    setRaidTitle(''); setMaxMembers(4); setIsCreateModalOpen(false); fetchRaids(); 
  };
  const handleEventClick = async (arg: any) => { const raidId = arg.event.id; const title = arg.event.title; const createdBy = arg.event.extendedProps.created_by_email; const max = arg.event.extendedProps.max_members || 4; const hostName = arg.event.extendedProps.host_name; const hostAvatar = arg.event.extendedProps.host_avatar; const { data } = await supabase.from('participants').select('*').eq('raid_id', raidId); setSelectedRaid({ id: raidId, title, date: arg.event.startStr, created_by_email: createdBy, max_members: max, host_name: hostName, host_avatar: hostAvatar }); setParticipants(data || []); setIsDetailModalOpen(true); };
  const handleJoin = async () => { if (!myProfile) return alert('프로필 필요'); const limit = selectedRaid.max_members || 4; if (participants.length >= limit) return alert(`🚫 정원이 꽉 찼습니다! (최대 ${limit}명)`); await supabase.from('participants').insert([{ raid_id: selectedRaid.id, user_name: myProfile.nickname, game_class: myProfile.game_class, user_avatar: user.user_metadata.avatar_url, user_email: user.email }]); refreshParticipants(selectedRaid.id); };
  const handleLeave = async () => { const isHost = selectedRaid.created_by_email === user.email; if (isHost && participants.length <= 1) { if (!confirm("파티가 해체됩니다. 삭제하시겠습니까?")) return; await supabase.from('raids').delete().eq('id', selectedRaid.id); setIsDetailModalOpen(false); fetchRaids(); } else { if (!confirm("취소?")) return; await supabase.from('participants').delete().eq('raid_id', selectedRaid.id).eq('user_email', user.email); refreshParticipants(selectedRaid.id); } };
  const handleDeleteRaid = async () => { if (!confirm("삭제?")) return; await supabase.from('raids').delete().eq('id', selectedRaid.id); setIsDetailModalOpen(false); fetchRaids(); };
  const refreshParticipants = async (raidId: any) => { const { data } = await supabase.from('participants').select('*').eq('raid_id', raidId); setParticipants(data || []); await fetchRaidCounts(); };
  const renderAvatar = (gameClass: string, size = "w-10 h-10") => { let imagePath = CLASS_IMAGES[gameClass] || "/class-icons/default.png"; return <img src={imagePath} className={`${size} rounded-full object-cover border border-[#b9dcf0] bg-[#ffffff]`} alt={gameClass} onError={(e) => { (e.target as HTMLImageElement).src = "/class-icons/default.png"; }} />; };
  const handleAddToCalendar = () => { if (!selectedRaid) return; const title = encodeURIComponent(`[길드] ${selectedRaid.title}`); const details = encodeURIComponent("환생 일정"); const dateStr = selectedRaid.date.replace(/-/g, ""); const dates = `${dateStr}/${dateStr}`; const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`; window.open(url, '_blank'); };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-xl font-bold text-[#6d94ac]">로딩중...</div>;
  if (!user) return <div className="min-h-screen flex flex-col justify-center items-center p-4"><div className="bg-[#ffffff] p-10 rounded-[2rem] border border-[#cfe6f5] text-center max-w-sm w-full relative overflow-hidden"><div className="absolute -top-24 -left-16 w-72 h-72 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(23,162,217,.22), transparent 65%)" }} /><div className="relative"><h1 className="text-3xl font-extrabold mb-8 text-[#164a63]">환생</h1><button onClick={handleLogin} className="w-full bg-transparent border border-[#17a2d9] p-4 rounded-2xl font-bold flex justify-center items-center gap-3 hover:bg-[#17a2d9]/12 active:bg-[#17a2d9]/22 transition-all text-[#0b7fae]"><span className="text-2xl">G</span> <span>구글 아이디로 시작</span></button><p className="text-[11px] text-[#87a9bd] mt-4">길드원만 가입할 수 있습니다</p></div></div></div>;

  const isJoined = participants.some(p => p.user_email === user.email);
  const isMyRaid = isAdmin || (selectedRaid?.created_by_email === user.email);

  // ================= ★ 모바일 홈 화면 =================
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingRaids = [...raids]
    .filter(r => r.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextRaid: any = upcomingRaids[0];

  const isAbyss = (title: string) => title.includes('어비스') || title.includes('지옥');

  const dDayLabel = (dateStr: string) => {
    const diff = Math.round(
      (new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime())
      / 86400000
    );
    if (diff === 0) return '오늘';
    if (diff === 1) return '내일';
    return `D-${diff}`;
  };

  const whenLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
  };

  // 모바일 홈 · 파티 카드
  const PartyRow = ({ raid }: { raid: any }) => {
    const filled = raidCounts[raid.id] || 0;
    const max = raid.max_members || 4;
    const abyss = isAbyss(raid.title);
    return (
      <button
        onClick={() => openRaidDetail(raid)}
        className="w-full bg-[#ffffff] border border-[#cfe6f5] rounded-2xl p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-all"
      >
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${abyss ? 'bg-[#e4f4fd] text-[#0b7fae]' : 'bg-[#fff1f4] text-[#e0526a]'}`}>
          {abyss ? <Icons.Calendar /> : <Icons.Chart />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[11px] px-2 py-0.5 rounded-md ${abyss ? 'bg-[#cfeafa] text-[#06465f]' : 'bg-[#ffd6de] text-[#b32f47]'}`}>
              {abyss ? '어비스' : '레이드'}
            </span>
            <span className="text-[11px] text-[#6d94ac]">{whenLabel(raid.date)}</span>
          </div>
          <div className="text-sm truncate">{raid.title}</div>
          <div className="text-[11px] text-[#6d94ac] mt-0.5">파티장 {raid.host_name || '알수없음'}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-[15px] ${filled >= max ? 'text-[#e0526a]' : 'text-[#0b7fae]'}`}>{filled}/{max}</div>
          <div className="text-[10px] text-[#87a9bd]">{filled >= max ? '마감' : '모집중'}</div>
        </div>
      </button>
    );
  };

  const MobileHome = () => (
    <div className="md:hidden">
      <div className="mb-5">
        <div className="text-[10px] tracking-[0.1em] uppercase text-[#17a2d9]">알리사 서버 · 환생</div>
        <h2 className="text-[26px] mt-1 leading-tight">오늘 어디 가지?</h2>
      </div>

      {nextRaid ? (
        <div className="bg-[#ffffff] border border-[#cfe6f5] rounded-2xl p-4 relative overflow-hidden mb-6">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(23,162,217,.18), transparent 60%)' }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-2.5">
              <span className={`text-[11px] px-2.5 py-0.5 rounded-md ${isAbyss(nextRaid.title) ? 'bg-[#cfeafa] text-[#06465f]' : 'bg-[#ffd6de] text-[#b32f47]'}`}>
                {isAbyss(nextRaid.title) ? '어비스' : '레이드'}
              </span>
              <span className="text-[11px] text-[#0b7fae] tracking-wide">{dDayLabel(nextRaid.date)}</span>
            </div>
            <h3 className="text-[21px] leading-tight mb-1">{nextRaid.title}</h3>
            <div className="text-[12px] text-[#6d94ac] mb-3.5">
              {whenLabel(nextRaid.date)} · 파티장 {nextRaid.host_name || '알수없음'}
            </div>
            <div className="flex items-center gap-1.5 mb-3.5">
              {Array.from({ length: nextRaid.max_members || 4 }).map((_, i) => {
                const taken = i < (raidCounts[nextRaid.id] || 0);
                return (
                  <div key={i} className={`flex-1 h-9 rounded-lg flex items-center justify-center text-[10px] ${taken ? 'bg-[#e4f4fd] text-[#0b7fae] ring-1 ring-inset ring-[#cfeafa]' : 'ring-1 ring-inset ring-[#cfe6f5] text-[#87a9bd]'}`}>
                    {taken ? '참가' : '빈자리'}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => openRaidDetail(nextRaid)}
              className="w-full min-h-[42px] rounded-xl border border-[#17a2d9] text-[#0b7fae] active:bg-[#17a2d9]/20 transition-all"
            >
              상세 · 참가
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#ffffff] border border-dashed border-[#b9dcf0] rounded-2xl p-8 text-center mb-6">
          <p className="text-sm text-[#5d87a1] mb-1">예정된 일정이 없습니다.</p>
          <p className="text-[11px] text-[#87a9bd] mb-4">첫 파티를 열어보세요.</p>
          <button onClick={openCreateModal} className="px-5 py-2.5 rounded-xl border border-[#17a2d9] text-[#0b7fae] text-sm">
            일정 등록
          </button>
        </div>
      )}

      <div className="flex items-baseline justify-between mb-2.5">
        <h4 className="text-[16px]">다가오는 일정</h4>
        <span className="text-[11px] text-[#6d94ac]">{upcomingRaids.length}개</span>
      </div>
      <div className="flex flex-col gap-2">
        {upcomingRaids.slice(0, 12).map(raid => <PartyRow key={raid.id} raid={raid} />)}
        {upcomingRaids.length === 0 && (
          <p className="text-[12px] text-[#87a9bd] py-6 text-center">표시할 일정이 없습니다.</p>
        )}
      </div>

      <div className="h-px my-5" style={{ background: 'linear-gradient(to right, transparent, rgba(13,60,82,.14) 40px, rgba(13,60,82,.14) calc(100% - 40px), transparent)' }} />
      <button onClick={() => setActiveTab('calendar')} className="w-full text-[12px] text-[#6d94ac] py-2">
        달력으로 보기 →
      </button>
    </div>
  );
  // ====================================================

  const TabButton = ({ tabName, label, icon }: { tabName: string, label: string, icon: any }) => (
    <button onClick={() => setActiveTab(tabName as any)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold transition-all duration-200 text-sm md:text-base ${activeTab === tabName ? 'bg-[#17a2d9] text-white shadow-md transform scale-105' : 'text-[#5d87a1] hover:bg-[#e6f2fb] hover:text-[#0f3f57]'}`}>
      {icon}<span>{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-screen text-[#0f3f57] overflow-hidden">
      {/* 헤더 */}
      <header className="h-16 md:h-20 bg-white/72 backdrop-blur-xl border-b border-[#cfe6f5] flex items-center justify-between px-4 md:px-10 shrink-0 z-30 shadow-sm relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer hover:scale-105 drop-shadow-[0_2px_6px_rgba(20,110,150,0.28)]">
            <Image src="/icon.png" alt="환생 길드 로고" width={40} height={40} className="w-full h-full object-contain" />
          </div>
          <span className="font-extrabold text-lg md:text-xl tracking-tight text-[#0f3f57]">환생</span>
        </div>
        <nav className="hidden md:flex items-center gap-2 bg-[#eef7fe] p-1.5 rounded-full border border-[#cfe6f5]">
          <TabButton tabName="calendar" label="일정" icon={<Icons.Calendar />} />
          <TabButton tabName="stats" label="통계" icon={<Icons.Chart />} />
          <TabButton tabName="board" label="팁" icon={<Icons.Board />} />
          {/* ★ 보이스 탭 복구 */}
          <TabButton tabName="voice" label="보이스" icon={<Icons.Mic />} />
          {isAdmin && <TabButton tabName="admin" label="관리" icon={<Icons.Admin />} />}
        </nav>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex flex-col items-end cursor-pointer group" onClick={openEditProfile}>
            <div className="text-sm font-bold text-[#164a63] flex items-center gap-1"><span className="hidden md:inline">{myProfile ? myProfile.nickname : '설정필요'}</span><span className="md:hidden">{myProfile ? myProfile.nickname.slice(0,4)+'..' : '설정'}</span></div>
            <div className="text-xs text-[#5d87a1] font-medium hidden md:block">{myProfile ? myProfile.game_class : ''}</div>
          </div>
          <div className="relative group cursor-pointer" onClick={openEditProfile}>{myProfile ? renderAvatar(myProfile.game_class, "w-9 h-9 md:w-10 md:h-10") : <div className="w-9 h-9 bg-[#cfe6f5] rounded-full"/>}</div>
          <button onClick={handleLogout} className="p-2 text-[#6d94ac] hover:text-[#e0526a] hover:bg-[#ffe7eb] rounded-full transition-all" title="로그아웃"><Icons.Logout /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full pb-24 md:pb-8 relative">
        {activeTab === 'home' ? (
          <>
            <MobileHome />
            {/* 데스크톱에는 홈 탭이 없으므로 캘린더를 보여줍니다 */}
            <div className="hidden md:flex bg-[#ffffff] p-8 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] h-full flex-col">
              <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, interactionPlugin, listPlugin]} initialView="dayGridMonth" events={raids} dateClick={(arg) => { setSelectedDate(arg.dateStr); setIsCreateModalOpen(true); }} eventClick={handleEventClick} height="100%" headerToolbar={{ left: 'prev', center: 'title', right: 'next' }} />
            </div>
            <button onClick={openCreateModal} className="fixed bottom-24 right-6 md:bottom-10 md:right-10 bg-[#17a2d9] text-white p-4 rounded-full shadow-lg hover:bg-[#0e8ec0] transition-all z-50 active:scale-95" title="일정 등록"><Icons.Plus /></button>
          </>
        ) : activeTab === 'calendar' ? (
          <div className="bg-[#ffffff] p-4 md:p-8 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] h-full flex flex-col">
            <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, interactionPlugin, listPlugin]} initialView="dayGridMonth" events={raids} dateClick={(arg) => { setSelectedDate(arg.dateStr); setIsCreateModalOpen(true); }} eventClick={handleEventClick} height="100%" headerToolbar={{ left: 'prev', center: 'title', right: 'next' }} />
            {/* ★ 1. 플로팅 등록 버튼 (FAB) - 캘린더 탭일 때만 보임 */}
            <button
              onClick={openCreateModal}
              className="fixed bottom-24 right-6 md:bottom-10 md:right-10 bg-[#17a2d9] text-white p-4 rounded-full shadow-lg hover:bg-[#0e8ec0] transition-all z-50 hover:scale-110 active:scale-95"
              title="일정 등록"
            >
              <Icons.Plus />
            </button>
          </div>
        ) : activeTab === 'stats' ? (
          // 통계 탭 (기존과 동일)
          <div className="space-y-6">
            <div className="bg-[#ffffff] p-6 md:p-8 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] h-[500px]"><div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-[#164a63] flex items-center gap-2"><Icons.Chart /> 참여 랭킹</h3><div className="flex bg-[#e6f2fb] p-1 rounded-xl"><button onClick={() => setStatsFilter('all')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statsFilter === 'all' ? 'bg-[#ffffff] text-[#0f3f57] shadow-sm' : 'text-[#6d94ac] hover:text-[#cfd3e5]'}`}>전체</button><button onClick={() => setStatsFilter('abyss')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statsFilter === 'abyss' ? 'bg-[#ffffff] text-[#0f3f57] shadow-sm' : 'text-[#6d94ac] hover:text-[#cfd3e5]'}`}>어비스</button><button onClick={() => setStatsFilter('raid')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statsFilter === 'raid' ? 'bg-[#ffffff] text-[#0f3f57] shadow-sm' : 'text-[#6d94ac] hover:text-[#cfd3e5]'}`}>레이드</button></div></div><ResponsiveContainer width="100%" height="90%"><BarChart data={statsData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cfe6f5" /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 14, fontWeight: 'bold', fill: '#4a7d97' }} /><Tooltip cursor={{ fill: '#eef7fe' }} contentStyle={{ borderRadius: '12px', border: '1px solid #a7d1e9', background: '#ffffff', color: '#0f3f57', boxShadow: '0 12px 32px rgba(20,110,150,0.18)' }} /><Bar dataKey="count" barSize={30} radius={[0, 10, 10, 0]}>{statsData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.name === myProfile?.nickname ? '#17a2d9' : '#a7d1e9'} />))}</Bar></BarChart></ResponsiveContainer></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{statsData.map((user, index) => (<div key={user.name} className={`bg-[#ffffff] p-5 rounded-2xl flex items-center justify-between shadow-sm border ${user.name === myProfile?.nickname ? 'border-[#17a2d9] ring-1 ring-[#17a2d9] bg-[#e4f4fd]' : 'border-[#cfe6f5]'}`}><div className="flex items-center gap-4"><span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${index < 3 ? 'bg-[#17a2d9] text-white' : 'bg-[#e6f2fb] text-[#5d87a1]'}`}>{index + 1}</span><div><div className="font-bold text-[#0f3f57]">{user.name}</div><div className="text-xs text-[#5d87a1] font-medium">{user.job}</div></div></div><div className={`font-extrabold text-lg ${user.name === myProfile?.nickname ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}>{user.count}회</div></div>))}</div>
          </div>
        ) : activeTab === 'board' ? (
          // 게시판 탭 (기존과 동일)
          <div className="relative min-h-full pb-20">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-[#164a63]">💡 꿀팁 공유 게시판</h3><button onClick={() => setIsWriteModalOpen(true)} className="flex items-center gap-2 bg-[#17a2d9] text-white px-5 py-2.5 rounded-xl font-bold hover:bg-[#0e8ec0] transition-all shadow-md active:scale-95"><Icons.Plus /> <span className="hidden md:inline">팁 작성하기</span><span className="md:hidden">글쓰기</span></button></div>
            <div className="grid grid-cols-1 gap-4">{posts.length === 0 ? <div className="text-center text-[#6d94ac] py-20 bg-[#ffffff] rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)]">아직 작성된 팁이 없습니다.</div> : null}{posts.map(post => (<div key={post.id} className="bg-[#ffffff] p-6 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] hover:border-[#cfeafa] hover:shadow-md transition-all group"><div className="flex justify-between items-start mb-3"><h3 className="text-lg font-bold text-[#0f3f57]">{post.title}</h3>{(isAdmin || post.user_id === user.id) && (<button onClick={() => handleDeletePost(post.id)} className="text-[#87a9bd] hover:text-[#e0526a] p-2 rounded-full hover:bg-[#ffe7eb] transition-all"><Icons.Trash /></button>)}</div><p className="text-[#4a7d97] text-sm whitespace-pre-wrap mb-5 leading-relaxed">{post.content}</p>
            {post.image_url && (<div className="mb-4 rounded-xl overflow-hidden border border-[#cfe6f5] cursor-pointer relative group/img" onClick={() => setViewImage(post.image_url)}><img src={post.image_url} alt="첨부 이미지" className="w-full object-cover max-h-80 transition-transform group-hover/img:scale-105" /><div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100"><span className="text-white bg-[#0d3c52]/45 px-3 py-1 rounded-full text-xs backdrop-blur-sm">클릭해서 확대</span></div></div>)}
            {post.file_url && (
              <a href={post.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 mb-4 bg-[#eef7fe] rounded-xl border border-[#b9dcf0] hover:bg-[#e4f4fd] hover:border-[#cfeafa] transition-colors group/file">
                <div className="bg-[#ffffff] p-2 rounded-lg text-[#0b7fae] shadow-sm"><Icons.File /></div>
                <div className="flex-1 overflow-hidden"><div className="text-sm font-bold text-[#265d75] truncate group-hover/file:text-[#075f84]">{post.file_name || '첨부파일'}</div><div className="text-xs text-[#6d94ac]">클릭하여 다운로드</div></div><div className="text-[#6d94ac] group-hover/file:text-[#0b7fae]"><Icons.Download /></div>
              </a>
            )}
            <div className="flex items-center gap-3 pt-4 border-t border-[#dcefFA]">{renderAvatar(post.author_class, "w-8 h-8")}<div><span className="block text-xs font-bold text-[#265d75]">{post.author_name}</span><span className="block text-[10px] text-[#6d94ac]">{post.author_class} · {post.created_at.split('T')[0]}</span></div></div></div>))}</div>
          </div>
        ) : activeTab === 'voice' ? (
          // 보이스 탭 (기존과 동일)
          <div className="h-full bg-[#ffffff] rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] overflow-hidden">
            <VoiceChatRoom user={user} roomName={voiceRoomName} />
          </div>
        ) : (
          // 관리자 탭 (기존과 동일)
          <div className="bg-[#ffffff] p-6 md:p-8 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] h-full"><div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-[#0f3f57] flex items-center gap-2"><Icons.Admin /> 회원 관리</h3><button onClick={openDungeonModal} className="flex items-center gap-2 bg-[#17a2d9] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0e8ec0] transition-all shadow-md active:scale-95"><Icons.Edit /> 던전 목록 관리</button></div><div className="space-y-4">{allProfiles.map(member => (<div key={member.id} className="flex items-center justify-between bg-[#eef7fe] p-4 rounded-2xl border border-[#cfe6f5] shadow-[0_4px_16px_rgba(20,110,150,0.07)]"><div className="flex items-center gap-4">{renderAvatar(member.game_class, "w-10 h-10")}<div><div className="font-bold text-[#0f3f57] flex items-center gap-2">{member.nickname} {member.role === 'admin' && <span className="bg-[#17a2d9] text-white text-[10px] px-2 py-0.5 rounded-full">ADMIN</span>}</div><div className="text-xs text-[#5d87a1]">{member.game_class}</div></div></div>{member.id !== user.id && member.role !== 'admin' && (<button onClick={() => handleDeleteMember(member.id, member.nickname)} className="px-4 py-2 bg-[#ffe7eb] text-[#e0526a] rounded-xl text-xs font-bold hover:bg-[#ffd6de] transition-all">강퇴</button>)}</div>))}</div></div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/85 backdrop-blur-xl border-t border-[#cfe6f5] flex justify-around items-center py-2 z-40 pb-safe">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'home' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Home /><span className="text-[10px] font-bold">홈</span></button>
        <button onClick={() => setActiveTab('calendar')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'calendar' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Calendar /><span className="text-[10px] font-bold">달력</span></button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'stats' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Chart /><span className="text-[10px] font-bold">통계</span></button>
        <button onClick={() => setActiveTab('board')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'board' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Board /><span className="text-[10px] font-bold">팁</span></button>
        <button onClick={() => setActiveTab('voice')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'voice' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Mic /><span className="text-[10px] font-bold">보이스</span></button>
        {isAdmin && <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'admin' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Admin /><span className="text-[10px] font-bold">관리</span></button>}
      </nav>

      {/* --- 모달들 (기존과 동일) --- */}
      {isProfileModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-6 md:p-8 rounded-[2rem] shadow-2xl w-full max-w-sm text-center"><h2 className="text-2xl font-bold mb-2 text-[#0f3f57]">{myProfile ? '프로필 수정' : '환영합니다!'}</h2><p className="text-[#5d87a1] mb-8 text-sm">정보를 입력해주세요.</p><div className="space-y-5"><div className="text-left"><label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">닉네임</label><input className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] transition-all" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} /></div><div className="text-left"><label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">직업</label><select className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] cursor-pointer appearance-none" value={newClass} onChange={(e) => setNewClass(e.target.value)}>{GAME_CLASSES.map(cls => (<option key={cls} value={cls}>{cls}</option>))}</select></div><div className="bg-[#e4f4fd] p-4 rounded-2xl flex flex-col items-center justify-center gap-2 border border-[#cfeafa]"><span className="text-xs font-bold text-[#0b7fae]">미리보기</span>{renderAvatar(newClass, "w-16 h-16")}</div></div><div className="flex gap-3 mt-8">{myProfile && <button onClick={() => setIsProfileModalOpen(false)} className="flex-1 py-4 bg-[#e6f2fb] text-[#4a7d97] rounded-2xl font-bold hover:bg-[#d9edf9]">취소</button>}<button onClick={handleSaveProfile} className="flex-1 bg-[#17a2d9] text-white py-4 rounded-2xl font-bold hover:bg-[#0e8ec0] shadow-lg transition-all">저장</button></div></div></div>)}
      
      {/* ★ 등록 모달 (날짜 선택 수정됨) */}
      {isCreateModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative"><h2 className="text-2xl font-bold mb-1 text-[#0f3f57]">일정 등록</h2><input type="date" className="w-full bg-[#eef7fe] p-3 rounded-xl mb-6 outline-none focus:ring-2 focus:ring-[#17a2d9] font-medium text-[#4a7d97] cursor-pointer" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /><div className="flex bg-[#e6f2fb] p-1 rounded-xl mb-4"><button onClick={() => setRaidType('abyss')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${raidType === 'abyss' ? 'bg-[#ffffff] text-[#0b7fae] shadow-sm' : 'text-[#6d94ac]'}`}>어비스</button><button onClick={() => setRaidType('raid')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${raidType === 'raid' ? 'bg-[#ffffff] text-[#0b7fae] shadow-sm' : 'text-[#6d94ac]'}`}>레이드</button></div><div className="mb-6 text-left">
        <div className="flex items-center justify-between mb-2 px-1">
          <label className="block text-xs font-bold text-[#6d94ac]">던전 선택</label>
          {/* ★ 관리자만 보이게 하려면 아래 true 를 isAdmin 으로 바꾸세요 */}
          {true && (<button onClick={openDungeonModal} className="flex items-center gap-1 text-xs font-bold text-[#0b7fae] hover:text-[#075f84] transition-colors"><Icons.Edit /> 목록 편집</button>)}
        </div>
        <select className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] cursor-pointer appearance-none text-lg" value={selectedDungeon} onChange={(e) => setSelectedDungeon(e.target.value)}>{dungeonList(raidType).map(dungeon => (<option key={dungeon} value={dungeon}>{dungeon}</option>))}</select>
      </div><div className="flex gap-3 mb-8"><button onClick={() => setMaxMembers(4)} className={`flex-1 py-3 rounded-2xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${maxMembers === 4 ? 'border-[#17a2d9] bg-[#e4f4fd] text-[#075f84]' : 'border-[#cfe6f5] text-[#6d94ac] hover:border-[#a7d1e9]'}`}><div className="flex gap-1"><Icons.UserGroup /><span className="text-lg">4</span></div><span className="text-xs">파티</span></button><button onClick={() => setMaxMembers(8)} className={`flex-1 py-3 rounded-2xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${maxMembers === 8 ? 'border-[#17a2d9] bg-[#e4f4fd] text-[#075f84]' : 'border-[#cfe6f5] text-[#6d94ac] hover:border-[#a7d1e9]'}`}><div className="flex gap-1"><Icons.UserGroup /><span className="text-lg">8</span></div><span className="text-xs">공대</span></button></div><div className="flex gap-3"><button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 bg-[#e6f2fb] text-[#4a7d97] rounded-2xl font-bold hover:bg-[#d9edf9] transition-colors">취소</button><button onClick={handleCreate} className="flex-1 py-4 bg-[#17a2d9] text-white rounded-2xl font-bold hover:bg-[#0e8ec0] shadow-lg transition-all">등록</button></div></div></div>)}

      {isWriteModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative"><h2 className="text-2xl font-bold mb-6 text-[#0f3f57] flex items-center gap-2"><Icons.Board /> 팁 작성하기</h2><input className="w-full bg-[#eef7fe] p-4 rounded-2xl mb-4 outline-none focus:ring-2 focus:ring-[#17a2d9] transition-all font-bold" placeholder="제목을 입력하세요" value={postTitle} onChange={e => setPostTitle(e.target.value)} autoFocus /><textarea className="w-full bg-[#eef7fe] p-4 rounded-2xl mb-8 outline-none focus:ring-2 focus:ring-[#17a2d9] transition-all h-40 resize-none" placeholder="내용을 작성해주세요." value={postContent} onChange={e => setPostContent(e.target.value)} /><div className="mb-6"><div className="flex gap-2 mb-2"><div className="flex-1"><input type="file" accept="image/*" id="img-upload" className="hidden" onChange={handleImageSelect} /><label htmlFor="img-upload" className="flex items-center justify-center gap-2 w-full py-3 bg-[#e6f2fb] rounded-xl cursor-pointer hover:bg-[#d9edf9] transition-all text-xs font-bold border border-dashed border-[#a7d1e9]"><Icons.Camera /> {selectedImage ? '사진 변경' : '사진 첨부'}</label></div><div className="flex-1"><input type="file" id="file-upload" className="hidden" onChange={handleFileSelect} /><label htmlFor="file-upload" className="flex items-center justify-center gap-2 w-full py-3 bg-[#e6f2fb] rounded-xl cursor-pointer hover:bg-[#d9edf9] transition-all text-xs font-bold border border-dashed border-[#a7d1e9]"><Icons.Clip /> {selectedFile ? '파일 변경' : '파일 첨부'}</label></div></div>{(previewUrl || selectedFile) && (<div className="space-y-2">{previewUrl && (<div className="relative w-full h-32 rounded-xl overflow-hidden border border-[#b9dcf0]"><img src={previewUrl} className="w-full h-full object-cover" alt="미리보기" /><button onClick={() => { setSelectedImage(null); setPreviewUrl(''); }} className="absolute top-1 right-1 bg-[#0d3c52]/45 text-white rounded-full p-1"><Icons.Close /></button></div>)}{selectedFile && (<div className="flex items-center justify-between bg-[#e4f4fd] p-3 rounded-xl border border-[#cfeafa]"><div className="flex items-center gap-2 overflow-hidden"><Icons.File /><span className="text-xs font-bold text-[#075f84] truncate">{selectedFile.name}</span></div><button onClick={() => setSelectedFile(null)} className="text-[#6d94ac] hover:text-[#e0526a]"><Icons.Close /></button></div>)}</div>)}</div><div className="flex gap-3"><button onClick={() => setIsWriteModalOpen(false)} className="flex-1 py-4 bg-[#e6f2fb] text-[#4a7d97] rounded-2xl font-bold hover:bg-[#d9edf9] transition-colors">취소</button><button onClick={handleWritePost} disabled={uploading} className="flex-1 py-4 bg-[#17a2d9] text-white rounded-2xl font-bold hover:bg-[#0e8ec0] shadow-lg transition-all disabled:bg-[#8fb9cf]">{uploading ? '업로드 중...' : '작성완료'}</button></div></div></div>)}
      {isDetailModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative overflow-hidden"><div className={`absolute top-0 left-0 w-full h-2 ${selectedRaid?.title?.includes('어비스') || selectedRaid?.title?.includes('지옥') ? 'bg-[#17a2d9]' : 'bg-[#ff7a8a]'}`}></div><div className="absolute top-5 right-5 flex gap-2">{isMyRaid && (<button onClick={handleDeleteRaid} className="text-[#87a9bd] hover:text-[#e0526a] p-2 transition-all"><Icons.Trash /></button>)}<button onClick={() => setIsDetailModalOpen(false)} className="text-[#87a9bd] hover:text-[#0f3f57] p-2 transition-all"><Icons.Close /></button></div><h2 className="text-2xl font-extrabold mb-2 pr-20 text-[#0f3f57] leading-tight">{selectedRaid?.title}</h2><div className="flex items-center gap-2 mb-6 bg-[#eef7fe] p-2 rounded-xl border border-[#cfe6f5] w-fit"><span className="text-xs text-[#6d94ac] font-bold">HOST</span>{selectedRaid?.host_avatar && renderAvatar(selectedRaid.host_avatar, "w-5 h-5")}<span className="text-sm font-bold text-[#265d75]">{selectedRaid?.host_name || '알수없음'}</span></div><div className="bg-[#eef7fe] p-6 rounded-3xl mb-6 max-h-[300px] overflow-y-auto border border-[#cfe6f5]"><p className="text-xs font-bold text-[#6d94ac] mb-4 uppercase tracking-wider flex items-center justify-between"><span>참가자 현황</span><span className={`px-2 py-1 rounded-full text-xs ${participants.length >= (selectedRaid?.max_members || 4) ? 'bg-[#ffe7eb] text-[#e0526a]' : 'bg-[#cfeafa] text-[#0b7fae]'}`}>{participants.length} / {selectedRaid?.max_members || 4}명</span></p><div className="space-y-3">{participants.length === 0 ? <p className="text-[#6d94ac] text-sm text-center py-4">참가자가 없습니다.</p> : null}{participants.map(p => (<div key={p.id} className="flex items-center justify-between bg-[#ffffff] p-3 rounded-2xl border border-[#cfe6f5] shadow-[0_4px_16px_rgba(20,110,150,0.07)]/50"><div className="flex items-center gap-4">{renderAvatar(p.game_class, "w-10 h-10")}<div className="flex flex-col"><span className="font-bold text-sm text-[#0f3f57]">{p.user_name}</span><span className="text-[10px] font-bold text-[#0b7fae] uppercase tracking-wide bg-[#e4f4fd] px-2 py-0.5 rounded-md w-fit mt-0.5">{p.game_class}</span></div></div></div>))}</div></div><div className="space-y-2">{isJoined ? (<><button onClick={handleAddToCalendar} className="w-full py-3 bg-[#e6f2fb] text-[#265d75] rounded-2xl font-bold hover:bg-[#d9edf9] text-sm flex justify-center items-center gap-2"><Icons.GoogleCal /> 구글 캘린더에 추가</button><button onClick={handleLeave} className="w-full py-4 bg-[#fff1f4] text-[#e0526a] rounded-2xl font-bold hover:bg-[#ffdde4] text-lg transition-all">참가 취소</button></>) : (<button onClick={handleJoin} disabled={participants.length >= (selectedRaid?.max_members || 4)} className={`w-full py-4 text-white rounded-2xl font-bold text-lg transition-all shadow-lg ${participants.length >= (selectedRaid?.max_members || 4) ? 'bg-[#8fb9cf] cursor-not-allowed' : 'bg-[#17a2d9] hover:bg-[#0e8ec0] active:scale-95'}`}>{participants.length >= (selectedRaid?.max_members || 4) ? '정원 마감' : '참가하기'}</button>)}</div></div></div>)}

      {/* ★ 던전 목록 관리 모달 */}
      {isDungeonModalOpen && (
        <div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[10000] p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[#ffffff] p-6 md:p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#0f3f57]">던전 목록 관리</h2>
              <button onClick={() => setIsDungeonModalOpen(false)} className="text-[#87a9bd] hover:text-[#0f3f57] p-1 transition-all"><Icons.Close /></button>
            </div>

            <div className="flex bg-[#e6f2fb] p-1 rounded-xl mb-4">
              <button onClick={() => { setDungeonTab('abyss'); setEditingId(null); }} className={`flex-1 py-2 rounded-lg font-bold transition-all ${dungeonTab === 'abyss' ? 'bg-[#ffffff] text-[#0b7fae] shadow-sm' : 'text-[#6d94ac]'}`}>어비스</button>
              <button onClick={() => { setDungeonTab('raid'); setEditingId(null); }} className={`flex-1 py-2 rounded-lg font-bold transition-all ${dungeonTab === 'raid' ? 'bg-[#ffffff] text-[#0b7fae] shadow-sm' : 'text-[#6d94ac]'}`}>레이드</button>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 mb-4">
              {dungeons.filter(d => d.type === dungeonTab).length === 0 ? (
                <div className="text-center py-8 bg-[#eef7fe] rounded-2xl border border-dashed border-[#b9dcf0]">
                  <p className="text-sm text-[#5d87a1] mb-1 font-bold">아직 DB에 저장된 목록이 없습니다.</p>
                  <p className="text-xs text-[#6d94ac] mb-4">지금은 코드에 있는 기본 목록이 사용 중입니다.</p>
                  <button onClick={handleSeedDungeons} className="px-5 py-3 bg-[#17a2d9] text-white rounded-xl font-bold text-sm hover:bg-[#0e8ec0] transition-all">기본 목록 불러오기</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {dungeons.filter(d => d.type === dungeonTab).map(row => (
                    <div key={row.id} className="flex items-center gap-2 bg-[#eef7fe] p-2 rounded-2xl border border-[#cfe6f5] shadow-[0_4px_16px_rgba(20,110,150,0.07)]">
                      {editingId === row.id ? (
                        <>
                          <input
                            className="flex-1 bg-[#ffffff] px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-[#17a2d9] min-w-0"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameDungeon(row); if (e.key === 'Escape') setEditingId(null); }}
                            autoFocus
                          />
                          <button onClick={() => handleRenameDungeon(row)} className="px-3 py-2 bg-[#17a2d9] text-white rounded-xl text-xs font-bold hover:bg-[#0e8ec0] shrink-0">저장</button>
                          <button onClick={() => { setEditingId(null); setEditingName(''); }} className="px-3 py-2 bg-[#cfe6f5] text-[#4a7d97] rounded-xl text-xs font-bold hover:bg-[#a7d1e9] shrink-0">취소</button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 px-2 font-bold text-sm text-[#164a63] truncate">{row.name}</span>
                          <button onClick={() => { setEditingId(row.id); setEditingName(row.name); }} className="p-2 text-[#6d94ac] hover:text-[#075f84] hover:bg-[#f5fbff] rounded-lg transition-all shrink-0" title="이름 수정"><Icons.Edit /></button>
                          <button onClick={() => handleDeleteDungeon(row)} className="p-2 text-[#6d94ac] hover:text-[#e0526a] hover:bg-[#f5fbff] rounded-lg transition-all shrink-0" title="삭제"><Icons.Trash /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[#cfe6f5] pt-4">
              <label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">새 던전 추가</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-[#eef7fe] px-4 py-3 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-[#17a2d9] min-w-0"
                  placeholder={dungeonTab === 'abyss' ? '예) 지옥 11단계' : '예) 신규 레이드 [입문]'}
                  value={newDungeonName}
                  onChange={e => setNewDungeonName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddDungeon(); }}
                />
                <button onClick={handleAddDungeon} className="px-5 py-3 bg-[#17a2d9] text-white rounded-2xl font-bold text-sm hover:bg-[#0e8ec0] shadow-md transition-all shrink-0">추가</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ★ 이미지 확대 보기 모달 (Lightbox) */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/90 z-[99999] flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200" onClick={() => setViewImage(null)}>
          <button onClick={() => setViewImage(null)} className="absolute top-5 right-5 text-white/80 hover:text-white p-2 rounded-full bg-[#0d3c52]/45 hover:bg-black/80 transition-all"><Icons.Close /></button>
          <img src={viewImage} alt="확대 이미지" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-default" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}