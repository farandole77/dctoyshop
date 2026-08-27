'use client';

import { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { supabase } from '@/lib/supabase';
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

// 어비스 계열인지 (참여 횟수 분류 등에 씁니다)
const isAbyssTitle = (title: string) => title.includes('어비스') || title.includes('지옥');

/* ── 색 유틸 ───────────────────────────────────────────────
   진한 색 하나만 정하면 파스텔 톤은 자동으로 계산합니다.        */
const mixWhite = (hex: string, ratio: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (v: number) => Math.round(v + (255 - v) * ratio);
  return `#${[m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};
const isDarkOn = (hex: string) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 < 150; // 어두우면 흰 글씨
};

/* ── 달력 4종 ──────────────────────────────────────────────
   기갱     : 파랑
   타임어택 : 빨강
   숙제     : 초록
   레이드   : 던전별로 색을 따로 지정 (던전 목록 관리에서 변경)   */
const CALENDARS = [
  { key: 'gigaeng',    label: '기갱',     title: '어비스 기갱 달력',     dungeonType: 'abyss' as const, tag: '[어비스]', full: '#2f5fe0' },
  { key: 'timeattack', label: '타임어택', title: '어비스 타임어택 달력', dungeonType: 'abyss' as const, tag: '[어비스]', full: '#d9394f' },
  { key: 'homework',   label: '숙제',     title: '어비스 숙제 달력',     dungeonType: 'abyss' as const, tag: '[어비스]', full: '#2e8b57' },
  { key: 'raid',       label: '레이드',   title: '레이드 달력',          dungeonType: 'raid'  as const, tag: '[레이드]', full: '#f0b429', perDungeon: true },
];

const CLOSED_COLOR = '#8fa3ae';   // 마감된 일정

/* ── 어비스 기갱 3종 ───────────────────────────────────── */
const GIGAENG = [
  { key: 'heosang', label: '허상', color: '#7c5cd6', soft: '#ece5fb' },
  { key: 'gwanggi', label: '광기', color: '#d1495b', soft: '#fbe3e6' },
  { key: 'mulgil',  label: '물길', color: '#1c86b8', soft: '#dceff9' },
];

// 오늘 (KST) — 조기 반환 위에서도 쓰이므로 모듈 최상단에 둡니다.
const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
const fmtTime = (sec: number) => sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '-';

const calOf = (key: string) => CALENDARS.find(c => c.key === key) || CALENDARS[0];

const Icons = {
  Heart: () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/></svg>),
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
  const [activeTab, setActiveTab] = useState<'home' | 'calendar' | 'stats' | 'paper' | 'board' | 'admin' | 'voice'>('home');
  const calendarRef = useRef<FullCalendar>(null);
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newClass, setNewClass] = useState(GAME_CLASSES[0]);  // 목록은 classNames() 가 DB 우선으로 돌려줍니다
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [raidTitle, setRaidTitle] = useState('');
  const [raidType, setRaidType] = useState<string>('gigaeng');
  const [selectedDungeon, setSelectedDungeon] = useState('');
  const [maxMembers, setMaxMembers] = useState(4);

  // ★ 프로필: 인게임 캐릭터 정보
  const [newCharName, setNewCharName] = useState('');
  const [gig, setGig] = useState<{ [k: string]: string }>({});

  // ★ 어비스 기록
  const [rankMode, setRankMode] = useState<string>('heosang');

  // ★ 도와줘
  const [helpRows, setHelpRows] = useState<any[]>([]);

  // ★ 롤링페이퍼
  const [papers, setPapers] = useState<any[]>([]);
  const [paperTarget, setPaperTarget] = useState('');
  const [isPaperModalOpen, setIsPaperModalOpen] = useState(false);
  const [pTo, setPTo] = useState('');
  const [pMood, setPMood] = useState('💌');
  const [pTitle, setPTitle] = useState('');
  const [pMsg, setPMsg] = useState('');
  const [pPoint, setPPoint] = useState('');
  const [pAnon, setPAnon] = useState(false);
  const [editingPaperId, setEditingPaperId] = useState<number | null>(null);

  // ★ 길드원 순위
  const rankSelfHealed = useRef(false);   // 자동 갱신은 세션당 한 번만
  const [rankRows, setRankRows] = useState<any[]>([]);
  const [rankWeek, setRankWeek] = useState<string>('');

  // ★ 모바일 홈 화면용: 일정별 참가 인원수
  const [raidCounts, setRaidCounts] = useState<{ [key: string]: number }>({});
  const [raidNames, setRaidNames] = useState<{ [key: string]: string[] }>({});
  const [activeCalendar, setActiveCalendar] = useState<string>('gigaeng');

  // ★ 던전 목록 관리용 상태
  const [dungeons, setDungeons] = useState<any[]>([]);

  // ★ 직업 목록 (DB 우선, 없으면 코드의 기본값)
  const [gameClasses, setGameClasses] = useState<any[]>([]);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassIcon, setNewClassIcon] = useState<File | null>(null);
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [editingClassName, setEditingClassName] = useState('');
  const [classBusy, setClassBusy] = useState(false);
  const [isDungeonModalOpen, setIsDungeonModalOpen] = useState(false);
  const [dungeonTab, setDungeonTab] = useState<'abyss' | 'raid'>('abyss');
  const [newDungeonName, setNewDungeonName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRaid, setSelectedRaid] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
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
    if (activeTab === 'stats') { fetchGuildRanking(); fetchHelpRequests(); }
    if (activeTab === 'paper') fetchPapers();
    if (activeTab === 'board') fetchPosts();
    if (activeTab === 'admin') fetchAllProfiles();
  }, [activeTab]);

  // ★ 레이드는 던전별 색, 나머지는 달력 고유색
  const eventColorOf = (ev: any) => {
    const cal = calOf(ev.calendar_type);
    if (!cal.perDungeon) return cal.full;
    // 제목에서 던전 이름을 찾아 그 던전에 지정된 색을 씁니다.
    const name = (ev.title || '').replace(/^\[[^\]]*\]\s*/, '').trim();
    const hit = dungeons.find(d => d.type === 'raid' && d.name === name);
    return hit?.color || cal.full;
  };

  // ★ 달력에 표시할 이벤트
  const calendarEvents = raids
    .filter(ev => ev.calendar_type === activeCalendar)
    .map(ev => {
      const names = raidNames[ev.id] || [];
      const max = ev.max_members || 4;
      const blocked = (ev.blocked_slots || []).length;
      const isFull = names.length + blocked >= max;

      // 라벨 규칙
      //  · 마감    → [마감] 이름들
      //  · 길드원만으로 꽉 참 → [모집완료] 이름들
      //  · 자리를 닫아 채운 방 → 이름들 외 n명
      //  · 그 외    → [모집중] 이름들
      const who = names.length > 0 ? names.join(', ') : '아직 없음';
      let label: string;
      if (ev.is_closed) label = `[마감] ${who}`;
      else if (isFull && blocked > 0) label = `${who} 외 ${blocked}명`;
      else if (isFull) label = `[모집완료] ${who}`;
      else label = `[모집중] ${who}`;

      const base = ev.is_closed ? CLOSED_COLOR : eventColorOf(ev);
      const solid = isFull || ev.is_closed;            // 꽉 찼거나 마감이면 진한 색
      const bg = solid ? base : mixWhite(base, 0.72);  // 모집중은 파스텔

      return {
        ...ev,
        title: label,
        backgroundColor: bg,
        borderColor: 'transparent',
        textColor: solid ? (isDarkOn(base) ? '#ffffff' : '#3d2c00') : '#33414d',
        extendedProps: { ...(ev.extendedProps || {}), realTitle: ev.title, blocked_slots: ev.blocked_slots || [], is_closed: !!ev.is_closed },
      };
    });

  // ★ 현재 사용할 던전 이름 목록 (DB 우선, 없으면 기본값)
  const dungeonList = (type: 'abyss' | 'raid'): string[] => {
    const rows = dungeons.filter(d => d.type === type);
    if (rows.length > 0) return rows.map(d => d.name);
    return DEFAULT_DUNGEON_DATA[type];
  };

  useEffect(() => {
    if (isCreateModalOpen) setSelectedDungeon(dungeonList(calOf(raidType).dungeonType)[0] || '');
  }, [raidType, isCreateModalOpen, dungeons]);

  const fetchHelpRequests = async () => {
    const { data } = await supabase
      .from('help_requests').select('*')
      .eq('request_date', todayKST())
      .order('created_at', { ascending: false });
    setHelpRows(data || []);
  };

  // ★ 고스트라이더 — 남는 자리를 잠가서 모집을 마감합니다.
  const toggleSlotBlock = async (slotIndex: number) => {
    if (!selectedRaid) return;
    const canEdit = isAdmin || selectedRaid.created_by_email === user.email;
    if (!canEdit) return alert('파티장만 자리를 잠글 수 있습니다.');

    const cur: number[] = selectedRaid.blocked_slots || [];
    const next = cur.includes(slotIndex) ? cur.filter(i => i !== slotIndex) : [...cur, slotIndex].sort((a, b) => a - b);

    const { error } = await supabase.from('raids').update({ blocked_slots: next }).eq('id', selectedRaid.id);
    if (error) return alert('변경 실패: ' + error.message);

    setSelectedRaid({ ...selectedRaid, blocked_slots: next });
    await fetchRaids();
  };

  // ================= ★ 직업 목록 관리 =================
  const fetchGameClasses = async () => {
    const { data, error } = await supabase
      .from('game_classes').select('*')
      .order('sort_order', { ascending: true }).order('id', { ascending: true });
    if (error) { console.error('직업 목록 조회 실패(기본값 사용):', error.message); return; }
    if (data) setGameClasses(data);
  };

  const uploadClassIcon = async (file: File) => {
    const ext = file.name.split('.').pop();
    const path = `class-icons/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(path, file);
    if (error) throw error;
    return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
  };

  const handleAddClass = async () => {
    const name = newClassName.trim();
    if (!name) return alert('직업 이름을 입력해주세요.');
    if (gameClasses.some(c => c.name === name)) return alert('이미 같은 직업이 있습니다.');
    setClassBusy(true);
    try {
      let iconUrl: string | null = null;
      if (newClassIcon) iconUrl = await uploadClassIcon(newClassIcon);
      const maxOrder = gameClasses.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
      const { error } = await supabase.from('game_classes')
        .insert([{ name, icon_url: iconUrl, sort_order: maxOrder + 1 }]);
      if (error) throw error;
      setNewClassName(''); setNewClassIcon(null);
      await fetchGameClasses();
    } catch (e: any) {
      alert('추가 실패: ' + e.message);
    } finally { setClassBusy(false); }
  };

  const handleRenameClass = async (row: any) => {
    const name = editingClassName.trim();
    if (!name) return alert('이름을 입력해주세요.');
    if (name === row.name) { setEditingClassId(null); return; }
    if (gameClasses.some(c => c.name === name)) return alert('이미 같은 직업이 있습니다.');

    const { error } = await supabase.from('game_classes').update({ name }).eq('id', row.id);
    if (error) return alert('수정 실패: ' + error.message);

    // 이 직업을 쓰던 사람들의 표기도 함께 바꿀지
    if (confirm(`'${row.name}' 직업을 쓰던 길드원의 표기도 '${name}' 으로 바꿀까요?`)) {
      await supabase.from('profiles').update({ game_class: name }).eq('game_class', row.name);
      await fetchAllProfiles();
      if (myProfile?.game_class === row.name) setMyProfile({ ...myProfile, game_class: name });
    }
    setEditingClassId(null); setEditingClassName('');
    await fetchGameClasses();
  };

  const handleChangeClassIcon = async (row: any, file: File) => {
    setClassBusy(true);
    try {
      const iconUrl = await uploadClassIcon(file);
      const { error } = await supabase.from('game_classes').update({ icon_url: iconUrl }).eq('id', row.id);
      if (error) throw error;
      await fetchGameClasses();
    } catch (e: any) {
      alert('아이콘 변경 실패: ' + e.message);
    } finally { setClassBusy(false); }
  };

  const handleDeleteClass = async (row: any) => {
    if (!confirm(`'${row.name}' 직업을 목록에서 지울까요?\n(이미 이 직업으로 설정한 길드원은 그대로 남습니다)`)) return;
    const { error } = await supabase.from('game_classes').delete().eq('id', row.id);
    if (error) return alert('삭제 실패: ' + error.message);
    await fetchGameClasses();
  };

  const handleSeedClasses = async () => {
    if (!confirm('기본 직업 목록을 DB에 저장할까요?\n(최초 1회만 실행하세요)')) return;
    const rows = Object.entries(CLASS_IMAGES).map(([name, icon_url], i) => ({ name, icon_url, sort_order: i + 1 }));
    const { error } = await supabase.from('game_classes').insert(rows);
    if (error) return alert('저장 실패: ' + error.message);
    await fetchGameClasses();
  };
  // ====================================================

  // ★ 마감 — 이미 던전을 돌았다는 표시
  const toggleRaidClosed = async () => {
    if (!selectedRaid) return;
    const canEdit = isAdmin || selectedRaid.created_by_email === user.email;
    if (!canEdit) return alert('파티장만 마감할 수 있습니다.');

    const next = !selectedRaid.is_closed;
    if (next && !confirm('이 일정을 마감할까요?\n(이미 던전을 돌았다는 표시입니다)')) return;

    const { error } = await supabase.from('raids')
      .update({ is_closed: next, closed_at: next ? new Date().toISOString() : null })
      .eq('id', selectedRaid.id);
    if (error) return alert('변경 실패: ' + error.message);

    setSelectedRaid({ ...selectedRaid, is_closed: next });
    await fetchRaids();
  };

  const initialize = async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { setUser(session.user); await loadProfile(session.user.id); }
    await fetchRaids();
    await fetchRaidCounts();
    await fetchHelpRequests();
    await fetchDungeons();
    await fetchGameClasses();
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
  const handleSaveProfile = async () => {
    if (!newNickname) return alert("입력해주세요!");
    const toInt = (v: string) => { const n = parseInt(v.replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : null; };
    const newProfile: any = {
      id: user.id, nickname: newNickname, game_class: newClass,
      character_name: newCharName.trim() || null,
      heosang_score: toInt(gig.heosang_score), heosang_seconds: toInt(gig.heosang_seconds),
      gwanggi_score: toInt(gig.gwanggi_score), gwanggi_seconds: toInt(gig.gwanggi_seconds),
      mulgil_score: toInt(gig.mulgil_score), mulgil_seconds: toInt(gig.mulgil_seconds),
      records_updated_at: new Date().toISOString(),
    };
    // ★ 닉네임이 바뀌었으면 흩어진 이름을 먼저 한꺼번에 정리합니다.
    const oldNick = myProfile?.nickname;
    if (oldNick && oldNick !== newNickname) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return alert('로그인이 만료되었습니다. 새로고침 후 다시 시도해주세요.');
      const res = await fetch('/api/profile/rename', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: oldNick, newName: newNickname }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return alert('닉네임 변경 실패: ' + (out.error || res.status));
    }

    const { error } = await supabase.from('profiles').upsert([newProfile]);
    if (error) return alert('저장 실패: ' + error.message);

    setMyProfile(newProfile);
    setIsProfileModalOpen(false);

    // ★ 캐릭터명을 넣었으면 월요일까지 기다리지 않고 바로 순위표에 반영
    refreshRankingNow();
  };

  // 순위 즉시 갱신 (공식 랭킹 수집은 건너뛰고 빠르게)
  const refreshRankingNow = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/rankings/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (activeTab === 'stats') await fetchGuildRanking();
    } catch (e) {
      console.error('순위 즉시 갱신 실패:', e);
    }
  };
  const openEditProfile = () => {
    if (myProfile) {
      setNewNickname(myProfile.nickname);
      setNewClass(myProfile.game_class);
      setNewCharName(myProfile.character_name || '');
      setGig({
        heosang_score: myProfile.heosang_score ? String(myProfile.heosang_score) : '',
        heosang_seconds: myProfile.heosang_seconds ? String(myProfile.heosang_seconds) : '',
        gwanggi_score: myProfile.gwanggi_score ? String(myProfile.gwanggi_score) : '',
        gwanggi_seconds: myProfile.gwanggi_seconds ? String(myProfile.gwanggi_seconds) : '',
        mulgil_score: myProfile.mulgil_score ? String(myProfile.mulgil_score) : '',
        mulgil_seconds: myProfile.mulgil_seconds ? String(myProfile.mulgil_seconds) : '',
      });
    }
    setIsProfileModalOpen(true);
  };
  
  const fetchRaids = async () => {
    const { data } = await supabase.from('raids').select('*');
    if (data) {
      setRaids(data.map((raid) => ({
        id: raid.id, title: raid.title, date: raid.start_time.split('T')[0],
        created_by_email: raid.created_by_email, host_name: raid.host_name, host_avatar: raid.host_avatar,
        max_members: raid.max_members,
        blocked_slots: raid.blocked_slots || [],
        is_closed: !!raid.is_closed,
        calendar_type: raid.calendar_type || (isAbyssTitle(raid.title) ? 'gigaeng' : 'raid'),
      })));
    }
  };

  const fetchPosts = async () => { const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }); if (data) setPosts(data); };

  // ★ 일정별 참가자 명단 (달력 · 모바일 홈에 닉네임으로 표시)
  const fetchRaidCounts = async () => {
    const { data } = await supabase.from('participants').select('raid_id, user_name').order('id');
    if (!data) return;
    const counts: { [key: string]: number } = {};
    const names: { [key: string]: string[] } = {};
    data.forEach((p: any) => {
      counts[p.raid_id] = (counts[p.raid_id] || 0) + 1;
      (names[p.raid_id] = names[p.raid_id] || []).push(p.user_name);
    });
    setRaidCounts(counts);
    setRaidNames(names);
  };

  // ★ 목록 카드에서 상세 모달 열기 (캘린더 클릭과 동일한 동작)
  const openRaidDetail = async (raid: any) => {
    const { data } = await supabase.from('participants').select('*').eq('raid_id', raid.id);
    setSelectedRaid({
      id: raid.id, title: raid.title, date: raid.date,
      created_by_email: raid.created_by_email, max_members: raid.max_members || 4,
      host_name: raid.host_name, host_avatar: raid.host_avatar,
      blocked_slots: raid.blocked_slots || [],
      is_closed: !!raid.is_closed,
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

  // ★ 레이드 던전별 색상
  const handleDungeonColor = async (row: any, color: string) => {
    const { error } = await supabase.from('dungeons').update({ color }).eq('id', row.id);
    if (error) return alert('색상 변경 실패: ' + error.message);
    setDungeons(dungeons.map(d => d.id === row.id ? { ...d, color } : d));
  };

  const handleDeleteDungeon = async (row: any) => {
    if (!confirm(`'${row.name}' 던전을 목록에서 삭제할까요?\n(이미 등록된 일정은 그대로 남습니다)`)) return;
    const { error } = await supabase.from('dungeons').delete().eq('id', row.id);
    if (error) return alert('삭제 실패: ' + error.message);
    await fetchDungeons();
  };

  const openDungeonModal = () => {
    setDungeonTab(calOf(raidType).dungeonType);
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
    if (!selectedDungeon) return alert('던전 선택!'); const typeTag = calOf(raidType).tag; setActiveCalendar(raidType); const finalTitle = `${typeTag} ${selectedDungeon}`; 
    const { data: newRaid, error } = await supabase.from('raids').insert([{ title: finalTitle, start_time: selectedDate, created_by_email: user.email, max_members: maxMembers, host_name: myProfile?.nickname || '알수없음', host_avatar: myProfile?.game_class || '모험가', calendar_type: raidType }]).select().single();
    if (newRaid) { await supabase.from('participants').insert([{ raid_id: newRaid.id, user_name: myProfile.nickname, game_class: myProfile.game_class, user_avatar: user.user_metadata.avatar_url, user_email: user.email }]); }
    setRaidTitle(''); setMaxMembers(4); setIsCreateModalOpen(false); fetchRaids(); 
  };
  const handleEventClick = async (arg: any) => { const raidId = arg.event.id; const title = arg.event.extendedProps.realTitle || arg.event.title; const createdBy = arg.event.extendedProps.created_by_email; const max = arg.event.extendedProps.max_members || 4; const hostName = arg.event.extendedProps.host_name; const hostAvatar = arg.event.extendedProps.host_avatar; const { data } = await supabase.from('participants').select('*').eq('raid_id', raidId); setSelectedRaid({ id: raidId, title, date: arg.event.startStr, created_by_email: createdBy, max_members: max, host_name: hostName, host_avatar: hostAvatar, blocked_slots: arg.event.extendedProps.blocked_slots || [], is_closed: !!arg.event.extendedProps.is_closed }); setParticipants(data || []); setIsDetailModalOpen(true); };
  const handleJoin = async () => { if (!myProfile) return alert('프로필 필요'); const limit = selectedRaid.max_members || 4; if (participants.length >= limit) return alert(`🚫 정원이 꽉 찼습니다! (최대 ${limit}명)`); await supabase.from('participants').insert([{ raid_id: selectedRaid.id, user_name: myProfile.nickname, game_class: myProfile.game_class, user_avatar: user.user_metadata.avatar_url, user_email: user.email }]); refreshParticipants(selectedRaid.id); };
  const handleLeave = async () => { const isHost = selectedRaid.created_by_email === user.email; if (isHost && participants.length <= 1) { if (!confirm("파티가 해체됩니다. 삭제하시겠습니까?")) return; await supabase.from('raids').delete().eq('id', selectedRaid.id); setIsDetailModalOpen(false); fetchRaids(); } else { if (!confirm("취소?")) return; await supabase.from('participants').delete().eq('raid_id', selectedRaid.id).eq('user_email', user.email); refreshParticipants(selectedRaid.id); } };
  const handleDeleteRaid = async () => { if (!confirm("삭제?")) return; await supabase.from('raids').delete().eq('id', selectedRaid.id); setIsDetailModalOpen(false); fetchRaids(); };
  const refreshParticipants = async (raidId: any) => { const { data } = await supabase.from('participants').select('*').eq('raid_id', raidId); setParticipants(data || []); await fetchRaidCounts(); };
  // DB에 등록된 직업이 있으면 그 아이콘을, 없으면 코드의 기본 아이콘을 씁니다.
  const classIconOf = (gameClass: string) =>
    gameClasses.find(c => c.name === gameClass)?.icon_url || CLASS_IMAGES[gameClass] || "/class-icons/default.png";

  const classNames = (): string[] =>
    gameClasses.length > 0 ? gameClasses.map(c => c.name) : Object.keys(CLASS_IMAGES);

  const renderAvatar = (gameClass: string, size = "w-10 h-10") => { let imagePath = classIconOf(gameClass); return <img src={imagePath} className={`${size} rounded-full object-cover border border-[#b9dcf0] bg-[#ffffff]`} alt={gameClass} onError={(e) => { (e.target as HTMLImageElement).src = "/class-icons/default.png"; }} />; };
  const handleAddToCalendar = () => { if (!selectedRaid) return; const title = encodeURIComponent(`[길드] ${selectedRaid.title}`); const details = encodeURIComponent("환생 일정"); const dateStr = selectedRaid.date.replace(/-/g, ""); const dates = `${dateStr}/${dateStr}`; const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`; window.open(url, '_blank'); };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-xl font-bold text-[#6d94ac]">로딩중...</div>;
  if (!user) return <div className="min-h-screen flex flex-col justify-center items-center p-4"><div className="bg-[#ffffff] p-10 rounded-[2rem] border border-[#cfe6f5] text-center max-w-sm w-full relative overflow-hidden"><div className="absolute -top-24 -left-16 w-72 h-72 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(23,162,217,.22), transparent 65%)" }} /><div className="relative"><h1 className="text-3xl font-extrabold mb-8 text-[#164a63]">환생</h1><button onClick={handleLogin} className="w-full bg-transparent border border-[#17a2d9] p-4 rounded-2xl font-bold flex justify-center items-center gap-3 hover:bg-[#17a2d9]/12 active:bg-[#17a2d9]/22 transition-all text-[#0b7fae]"><span className="text-2xl">G</span> <span>구글 아이디로 시작</span></button><p className="text-[11px] text-[#87a9bd] mt-4">길드원만 가입할 수 있습니다</p></div></div></div>;

  // ★ 상세 모달의 자리 배치 계산
  //    4인이면 2x2, 8인이면 4x2. 참가자를 잠기지 않은 칸에 순서대로 앉힙니다.
  const slotState = (() => {
    const max = selectedRaid?.max_members || 4;
    const blocked: number[] = selectedRaid?.blocked_slots || [];
    const cols = max <= 4 ? 2 : Math.ceil(max / 2);

    let seat = 0;
    const slots = Array.from({ length: max }, (_, index) => {
      if (blocked.includes(index)) return { index, kind: 'blocked' as const, member: null };
      const member = participants[seat];
      if (member) { seat++; return { index, kind: 'member' as const, member }; }
      return { index, kind: 'empty' as const, member: null };
    });

    return { max, cols, slots, isFull: participants.length + blocked.length >= max };
  })();

  const isJoined = participants.some(p => p.user_email === user.email);
  const isMyRaid = isAdmin || (selectedRaid?.created_by_email === user.email);

  // ================= ★ 모바일 홈 화면 =================
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingRaids = [...raids]
    .filter(r => r.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextRaid: any = upcomingRaids[0];

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
    const abyss = isAbyssTitle(raid.title);
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

  // 오늘 도움을 요청한 사람들을 알리는 띠
  const HelpBanner = () => {
    if (helpRows.length === 0) return null;
    return (
      <div className="mb-4 bg-[#fff6e0] border border-[#f7dfa4] rounded-2xl p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-extrabold bg-[#f0b429] text-[#4a3208] px-2 py-1 rounded">🙋 도와줘</span>
          <span className="text-[11px] text-[#8a6a1e]">오늘 도움을 기다리는 길드원</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {helpRows.map(h => {
            const r = rankRows.find(x => x.nickname === h.nickname);
            return (
              <div key={h.id} className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-extrabold text-[#5b420a]">{h.nickname}</span>
                {r && GIGAENG.map(g => (
                  <span key={g.key} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: g.soft, color: g.color }}>
                    {g.label} {(r[`${g.key}_score`] || 0).toLocaleString()}
                  </span>
                ))}
                {h.message && <span className="text-[11px] text-[#8a6a1e] truncate">— {h.message}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const MobileHome = () => (
    <div className="md:hidden">
      <div className="mb-5">
        <div className="text-[10px] tracking-[0.1em] uppercase text-[#17a2d9]">알리사 서버 · 환생</div>
        <h2 className="text-[26px] mt-1 leading-tight">오늘 어디 가지?</h2>
      </div>

      <HelpBanner />

      <button onClick={toggleHelp}
        className={`w-full mb-5 py-3 rounded-2xl font-bold text-sm transition-all border ${iAmAskingHelp
          ? 'bg-[#f0b429] border-[#f0b429] text-[#4a3208]'
          : 'bg-[#ffffff] border-[#f7dfa4] text-[#8a6a1e] active:bg-[#fff6e0]'}`}>
        {iAmAskingHelp ? '🙋 도움 요청 중 — 취소하려면 누르세요' : '🙋 도와줘 — 오늘 도움이 필요해요'}
      </button>

      {nextRaid ? (
        <div className="bg-[#ffffff] border border-[#cfe6f5] rounded-2xl p-4 relative overflow-hidden mb-6">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(23,162,217,.18), transparent 60%)' }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-2.5">
              <span className={`text-[11px] px-2.5 py-0.5 rounded-md ${isAbyssTitle(nextRaid.title) ? 'bg-[#cfeafa] text-[#06465f]' : 'bg-[#ffd6de] text-[#b32f47]'}`}>
                {isAbyssTitle(nextRaid.title) ? '어비스' : '레이드'}
              </span>
              <span className="text-[11px] text-[#0b7fae] tracking-wide">{dDayLabel(nextRaid.date)}</span>
            </div>
            <h3 className="text-[21px] leading-tight mb-1">{nextRaid.title}</h3>
            <div className="text-[12px] text-[#6d94ac] mb-3.5">
              {whenLabel(nextRaid.date)} · 파티장 {nextRaid.host_name || '알수없음'}
            </div>
            <div className="flex items-center gap-1.5 mb-3.5">
              {Array.from({ length: nextRaid.max_members || 4 }).map((_, i) => {
                const who = (raidNames[nextRaid.id] || [])[i];
                return (
                  <div key={i} title={who || '빈자리'} className={`flex-1 h-9 px-1 rounded-lg flex items-center justify-center text-[10px] font-bold truncate ${who ? 'bg-[#e4f4fd] text-[#0b7fae] ring-1 ring-inset ring-[#cfeafa]' : 'ring-1 ring-inset ring-[#cfe6f5] text-[#87a9bd] font-normal'}`}>
                    {who || '빈자리'}
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

  // ================= ★ 길드원 순위 (어비스 기갱) =================

  const fetchGuildRanking = async () => {
    // 오늘 스냅샷 (없으면 가장 최근 날짜)
    const today = todayKST();
    let { data: cur } = await supabase.from('abyss_daily').select('*').eq('snapshot_date', today);
    let curDate = today;
    if (!cur || cur.length === 0) {
      const { data: latest } = await supabase.from('abyss_daily').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
      if (latest && latest.length > 0) {
        curDate = latest[0].snapshot_date;
        const r = await supabase.from('abyss_daily').select('*').eq('snapshot_date', curDate);
        cur = r.data || [];
      }
    }
    if (!cur || cur.length === 0) { setRankRows([]); setRankWeek(''); return; }

    // 내 기록이 아직 없으면 한 번 즉시 갱신
    if (myProfile?.nickname && !cur.some((r: any) => r.nickname === myProfile.nickname)
        && (myProfile.heosang_score || myProfile.gwanggi_score || myProfile.mulgil_score)
        && !rankSelfHealed.current) {
      rankSelfHealed.current = true;
      await refreshRankingNow();
      return;
    }

    // 어제(직전) 스냅샷 — 순위 변동 계산용
    const prevDate = new Date(new Date(curDate).getTime() - 86400000).toISOString().split('T')[0];
    const { data: prevRows } = await supabase.from('abyss_daily').select('*').eq('snapshot_date', prevDate);

    // 이번 주 참여 횟수
    const weekStart = (() => {
      const k = new Date(Date.now() + 9 * 3600 * 1000);
      const d = k.getUTCDay();
      return new Date(k.getTime() - (d === 0 ? 6 : d - 1) * 86400000).toISOString().split('T')[0];
    })();
    const weekEnd = new Date(new Date(weekStart).getTime() + 6 * 86400000).toISOString().split('T')[0];
    const { data: joins } = await supabase
      .from('participants')
      .select('user_name, raids!inner(title, date:start_time, calendar_type)')
      .gte('raids.start_time', weekStart)
      .lte('raids.start_time', weekEnd + 'T23:59:59');

    const abyssCnt: { [k: string]: number } = {};
    const raidCnt: { [k: string]: number } = {};
    (joins || []).forEach((j: any) => {
      const ct = j.raids?.calendar_type || (isAbyssTitle(j.raids?.title || '') ? 'gigaeng' : 'raid');
      const who = j.user_name;
      if (ct === 'raid') raidCnt[who] = (raidCnt[who] || 0) + 1;
      else abyssCnt[who] = (abyssCnt[who] || 0) + 1;
    });

    setRankWeek(curDate);
    setRankRows(cur.map((r: any) => ({
      ...r,
      prev: (prevRows || []).find((p: any) => p.nickname === r.nickname) || null,
      abyss: abyssCnt[r.nickname] || 0,
      raid: raidCnt[r.nickname] || 0,
    })));
  };

  // 선택한 기갱 종류 기준으로 정렬 + 어제 대비 변동
  const rankedByMode = (() => {
    const scoreKey = `${rankMode}_score`;
    const secKey = `${rankMode}_seconds`;
    const sortFn = (a: any, b: any) =>
      (b[scoreKey] || 0) - (a[scoreKey] || 0) ||
      ((a[secKey] || 99999) - (b[secKey] || 99999));

    const cur = [...rankRows].filter(r => (r[scoreKey] || 0) > 0).sort(sortFn);
    const prev = rankRows
      .map(r => r.prev).filter(Boolean)
      .filter((r: any) => (r[scoreKey] || 0) > 0).sort(sortFn);
    const prevRank = new Map(prev.map((r: any, i) => [r.nickname, i + 1]));

    return cur.map((r, i) => {
      const before = prevRank.get(r.nickname);
      return {
        ...r, rank: i + 1,
        score: r[scoreKey] || 0, seconds: r[secKey] || 0,
        change: before == null ? null : before - (i + 1),
        isNew: before == null,
      };
    });
  })();
  // ==============================================================

  // ================= ★ 도와줘 =================
  //  오늘 도움을 요청한 사람들. 순위표에서 그 사람 줄이 강조됩니다.
  const helpNames = new Set(helpRows.map(h => h.nickname));
  const iAmAskingHelp = !!myProfile && helpNames.has(myProfile.nickname);

  const toggleHelp = async () => {
    if (!myProfile) return alert('먼저 프로필을 설정해주세요.');
    if (iAmAskingHelp) {
      const { error } = await supabase.from('help_requests')
        .delete().eq('user_id', user.id).eq('request_date', todayKST());
      if (error) return alert('취소 실패: ' + error.message);
    } else {
      const msg = prompt('무엇을 도와드릴까요? (선택 — 비워도 됩니다)\n예) 허상 기갱 같이 도실 분!') ?? '';
      const { error } = await supabase.from('help_requests')
        .insert([{ user_id: user.id, nickname: myProfile.nickname, message: msg.trim() || null }]);
      if (error) return alert('요청 실패: ' + error.message);
    }
    await fetchHelpRequests();
  };
  // ============================================

  // ================= ★ 롤링페이퍼 =================
  const MOODS = ['💌', '😂', '🔥', '🥹', '👍', '🫶', '⭐', '🍀'];

  const fetchPapers = async () => {
    const { data } = await supabase.from('rolling_papers').select('*').order('created_at', { ascending: false });
    setPapers(data || []);
    if (allProfiles.length === 0) fetchAllProfiles();
  };

  const openPaperModal = (to?: string) => {
    if (!myProfile) return alert('먼저 프로필을 설정해주세요.');
    setEditingPaperId(null);
    setPTo(to || paperTarget || '');
    setPMood('💌'); setPTitle(''); setPMsg(''); setPPoint(''); setPAnon(false);
    setIsPaperModalOpen(true);
  };

  // ★ 내가 쓴 롤링페이퍼 고치기
  const openPaperEdit = (row: any) => {
    setEditingPaperId(row.id);
    setPTo(row.to_nickname);
    setPMood(row.mood || '💌');
    setPTitle(row.title || '');
    setPMsg(row.message || '');
    setPPoint(row.point || '');
    setPAnon(!!row.is_anonymous);
    setIsPaperModalOpen(true);
  };

  const handleSavePaper = async () => {
    if (!pTo) return alert('누구에게 쓸지 골라주세요.');
    if (!pMsg.trim()) return alert('메시지를 입력해주세요.');

    const payload = {
      to_nickname: pTo,
      author_name: pAnon ? '익명' : myProfile.nickname,
      is_anonymous: pAnon,
      mood: pMood,
      title: pTitle.trim() || null,
      message: pMsg.trim(),
      point: pPoint.trim() || null,
    };

    const { error } = editingPaperId
      ? await supabase.from('rolling_papers')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingPaperId)
      : await supabase.from('rolling_papers')
          .insert([{ ...payload, author_id: user.id }]);

    if (error) return alert('저장 실패: ' + error.message);
    setIsPaperModalOpen(false);
    setEditingPaperId(null);
    await fetchPapers();
  };

  const handleDeletePaper = async (row: any) => {
    if (!confirm('이 롤링페이퍼를 삭제할까요?')) return;
    const { error } = await supabase.from('rolling_papers').delete().eq('id', row.id);
    if (error) return alert('삭제 실패: ' + error.message);
    await fetchPapers();
  };

  // 화면에 보여줄 목록 (받는 사람 필터)
  const visiblePapers = paperTarget ? papers.filter(p => p.to_nickname === paperTarget) : papers;
  // 가장 많이 쓴 사람 = 참여왕
  const paperKing = (() => {
    const c: { [k: string]: number } = {};
    papers.forEach(p => { if (!p.is_anonymous) c[p.author_name] = (c[p.author_name] || 0) + 1; });
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : '-';
  })();
  // ================================================

  // 순위 변동 표시 (사진처럼 화살표 + 칸수)
  const RankDelta = ({ change, isNew }: { change: number | null; isNew: boolean }) => {
    if (isNew) return <span className="text-[10px] font-bold text-[#0b7fae] bg-[#cfeafa] px-1.5 py-0.5 rounded">NEW</span>;
    if (change === null || change === 0) return <span className="text-[#e0526a] font-bold">—</span>;
    const up = change > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 font-bold ${up ? 'text-[#e0526a]' : 'text-[#2f6fd0]'}`}>
        <span className="text-sm leading-none">{up ? '▲' : '▼'}</span>
        <span className="text-xs">{Math.abs(change)}</span>
      </span>
    );
  };

  // 1~3위 메달
  const RankBadge = ({ rank }: { rank: number }) => {
    const medal = rank === 1 ? { bg: '#ffc94d', fg: '#7a4b00' }
      : rank === 2 ? { bg: '#cfe0ea', fg: '#3d5866' }
      : rank === 3 ? { bg: '#e8b487', fg: '#6b3d16' } : null;
    if (!medal) return <span className="w-7 h-7 inline-flex items-center justify-center text-sm font-bold text-[#4a7d97]">{rank}</span>;
    return (
      <span className="w-7 h-7 inline-flex items-center justify-center rounded-full text-xs font-extrabold shadow-sm"
        style={{ background: medal.bg, color: medal.fg }}>{rank}</span>
    );
  };
  // ================================================

  // ★ 달력 패널 — 일정 탭과 홈 화면(데스크톱) 양쪽에서 함께 씁니다.
  const CalendarPanel = () => (
  <div className="bg-[#ffffff] p-4 md:p-8 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] h-full flex flex-col">
              {/* ★ 달력 3종 전환 */}
              <div className="flex bg-[#e6f2fb] p-1 rounded-xl mb-3">
                {CALENDARS.map(c => (
                  <button key={c.key} onClick={() => setActiveCalendar(c.key)}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${activeCalendar === c.key ? 'bg-[#ffffff] shadow-sm' : 'text-[#6d94ac]'}`}
                    style={activeCalendar === c.key ? { color: calOf(c.key).full } : undefined}>
                    {c.label}
                  </button>
                ))}
              </div>

              {/* ★ 제목 + 범례 */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
                <h3 className="text-base md:text-lg font-extrabold text-[#0f3f57]">{calOf(activeCalendar).title}</h3>
                <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap justify-end">
                  {calOf(activeCalendar).perDungeon
                    ? dungeons.filter(d => d.type === 'raid').slice(0, 8).map(d => (
                        <span key={d.id} className="flex items-center gap-1.5 text-[11px] font-bold text-[#4a7d97]">
                          <span className="w-3.5 h-3.5 rounded" style={{ background: d.color || calOf(activeCalendar).full }} />{d.name}
                        </span>
                      ))
                    : [{ c: calOf(activeCalendar).full, t: '모집완료' },
                       { c: mixWhite(calOf(activeCalendar).full, 0.72), t: '모집중' }].map(l => (
                        <span key={l.t} className="flex items-center gap-1.5 text-[11px] font-bold text-[#4a7d97]">
                          <span className="w-3.5 h-3.5 rounded" style={{ background: l.c }} />{l.t}
                        </span>
                      ))}
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#4a7d97]">
                    <span className="w-3.5 h-3.5 rounded" style={{ background: CLOSED_COLOR }} />마감
                  </span>
                </div>
              </div>

              <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, interactionPlugin, listPlugin]} initialView="dayGridMonth" events={calendarEvents} dateClick={(arg) => { setSelectedDate(arg.dateStr); setRaidType(activeCalendar); setIsCreateModalOpen(true); }} eventClick={handleEventClick} height="100%" headerToolbar={{ left: 'prev', center: 'title', right: 'next' }} />
            </div>
  );

  const TabButton = ({ tabName, label, icon }: { tabName: string, label: string, icon: any }) => {
    // 홈은 모바일 전용 화면이라, 데스크톱에서는 '일정'이 선택된 것으로 보이게 합니다.
    const activeTabName = activeTab === 'home' ? 'calendar' : activeTab;
    return (
    <button onClick={() => setActiveTab(tabName as any)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold transition-all duration-200 text-sm md:text-base ${activeTabName === tabName ? 'bg-[#17a2d9] text-white shadow-md transform scale-105' : 'text-[#5d87a1] hover:bg-[#e6f2fb] hover:text-[#0f3f57]'}`}>
      {icon}<span>{label}</span>
    </button>
    );
  };

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
          <TabButton tabName="stats" label="순위" icon={<Icons.Chart />} />
          <TabButton tabName="paper" label="롤링페이퍼" icon={<Icons.Heart />} />
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
            {/* 데스크톱에는 홈 탭이 없으므로 같은 달력 패널을 그대로 보여줍니다 */}
            <div className="hidden md:flex flex-col h-full">
              <CalendarPanel />
            </div>
            <button onClick={openCreateModal} className="fixed bottom-24 right-6 md:bottom-10 md:right-10 bg-[#17a2d9] text-white p-4 rounded-full shadow-lg hover:bg-[#0e8ec0] transition-all z-50 active:scale-95" title="일정 등록"><Icons.Plus /></button>
          </>
        ) : activeTab === 'calendar' ? (
          <>
            <CalendarPanel />
            <button onClick={openCreateModal} className="fixed bottom-24 right-6 md:bottom-10 md:right-10 bg-[#17a2d9] text-white p-4 rounded-full shadow-lg hover:bg-[#0e8ec0] transition-all z-50 hover:scale-110 active:scale-95" title="일정 등록"><Icons.Plus /></button>
          </>
        ) : activeTab === 'stats' ? (
          // ★ 어비스 기갱 순위
          <div className="bg-[#ffffff] p-4 md:p-8 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-lg md:text-xl font-bold text-[#0f3f57] flex items-center gap-2">🏆 어비스 기갱 순위</h3>
              <span className="text-[11px] text-[#6d94ac]">
                {rankWeek ? `${rankWeek} 기준 · 매일 갱신` : '아직 집계된 기록이 없습니다'}
              </span>
            </div>

            <HelpBanner />

            <button onClick={toggleHelp}
              className={`w-full mb-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${iAmAskingHelp
                ? 'bg-[#f0b429] border-[#f0b429] text-[#4a3208]'
                : 'bg-[#ffffff] border-[#f7dfa4] text-[#8a6a1e] hover:bg-[#fff6e0]'}`}>
              {iAmAskingHelp ? '🙋 도움 요청 중 — 취소하려면 누르세요' : '🙋 도와줘 — 오늘 도움이 필요해요'}
            </button>

            <div className="flex bg-[#e6f2fb] p-1 rounded-xl mb-5">
              {GIGAENG.map(g => (
                <button key={g.key} onClick={() => setRankMode(g.key)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${rankMode === g.key ? 'bg-[#ffffff] shadow-sm' : 'text-[#6d94ac]'}`}
                  style={rankMode === g.key ? { color: g.color } : undefined}>
                  {g.label}
                </button>
              ))}
            </div>

            {rankedByMode.length === 0 ? (
              <div className="text-center py-16 text-[#6d94ac]">
                <p className="font-bold mb-1">아직 등록된 기갱 기록이 없습니다.</p>
                <p className="text-xs text-[#87a9bd]">프로필에서 점수를 입력하거나, PC 자동 전송을 설정해 보세요.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="text-[11px] text-[#5d87a1] border-b border-[#cfe6f5]">
                      <th className="text-left font-bold py-2.5 pl-1 w-20">순위</th>
                      <th className="text-left font-bold py-2.5">캐릭터</th>
                      <th className="text-center font-bold py-2.5 w-16">어비스</th>
                      <th className="text-center font-bold py-2.5 w-16">레이드</th>
                      <th className="text-center font-bold py-2.5 w-16">시간</th>
                      <th className="text-right font-bold py-2.5 pr-1 w-24">기갱 점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedByMode.map(r => {
                      const isMe = myProfile && r.nickname === myProfile.nickname;
                      const helped = helpNames.has(r.nickname);
                      return (
                        <tr key={r.nickname}
                          className={`border-b border-[#eef7fe] transition-colors ${helped ? 'bg-[#fff6e0]' : isMe ? 'bg-[#e4f4fd]' : 'hover:bg-[#f5fbff]'}`}
                          style={helped ? { boxShadow: 'inset 3px 0 0 #f0b429' } : undefined}>
                          <td className="py-3 pl-1">
                            <div className="flex items-center gap-1.5">
                              <RankBadge rank={r.rank} />
                              <RankDelta change={r.change} isNew={r.isNew} />
                            </div>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2.5">
                              {renderAvatar(r.game_class, "w-8 h-8")}
                              <div className="min-w-0">
                                <div className={`text-sm font-bold truncate flex items-center gap-1.5 ${isMe ? 'text-[#0b7fae]' : 'text-[#0f3f57]'}`}>
                                  {r.nickname}
                                  {helped && <span className="text-[9px] font-extrabold bg-[#f0b429] text-[#4a3208] px-1.5 py-0.5 rounded">도와줘</span>}
                                </div>
                                {r.character_name && r.character_name !== r.nickname && (
                                  <div className="text-[10px] text-[#87a9bd] truncate">{r.character_name}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`inline-block min-w-[30px] px-2 py-1 rounded-lg text-xs font-bold ${r.abyss > 0 ? 'bg-[#cfeafa] text-[#06465f]' : 'text-[#a7d1e9]'}`}>{r.abyss}</span>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`inline-block min-w-[30px] px-2 py-1 rounded-lg text-xs font-bold ${r.raid > 0 ? 'bg-[#ffd6de] text-[#b32f47]' : 'text-[#a7d1e9]'}`}>{r.raid}</span>
                          </td>
                          <td className="py-3 text-center text-xs font-bold text-[#265d75] tabular-nums">{fmtTime(r.seconds)}</td>
                          <td className="py-3 pr-1 text-right text-sm font-extrabold tabular-nums"
                            style={{ color: GIGAENG.find(g => g.key === rankMode)?.color }}>
                            {r.score.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-[#87a9bd] mt-5 leading-relaxed">
              점수가 같으면 클리어 시간이 빠른 쪽이 위로 올라갑니다.
              어비스 · 레이드 횟수는 이번 주(월~일) 일정표에서 참가 버튼을 누른 횟수입니다.
              순위 변동은 어제 대비 오르내린 칸수입니다.
            </p>
          </div>
        ) : activeTab === 'paper' ? (
          // ★ 롤링페이퍼
          <div className="space-y-4">
            <div className="bg-[#ffffff] p-5 md:p-6 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-[#0f3f57]">💌 롤링페이퍼</h3>
                  <p className="text-[11px] text-[#6d94ac] mt-1">추억 하나 + 칭찬 하나 + 응원 한마디. 편하게 남겨주세요.</p>
                </div>
                <button onClick={() => openPaperModal()} className="flex items-center gap-1.5 bg-[#17a2d9] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0e8ec0] shadow-md active:scale-95 transition-all">
                  <Icons.Plus /> 남기기
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-[#eef7fe] rounded-2xl py-3 text-center border border-[#cfe6f5]">
                  <div className="text-[10px] text-[#6d94ac] mb-0.5">모인 편지</div>
                  <div className="text-lg font-extrabold text-[#0f3f57]">{papers.length}</div>
                </div>
                <div className="bg-[#eef7fe] rounded-2xl py-3 text-center border border-[#cfe6f5]">
                  <div className="text-[10px] text-[#6d94ac] mb-0.5">1인당 평균</div>
                  <div className="text-lg font-extrabold text-[#0f3f57]">
                    {allProfiles.length > 0 ? (papers.length / allProfiles.length).toFixed(1) : '0'}
                  </div>
                </div>
                <div className="bg-[#fff1f4] rounded-2xl py-3 text-center border border-[#ffd6de]">
                  <div className="text-[10px] text-[#b32f47] mb-0.5">참여왕</div>
                  <div className="text-sm font-extrabold text-[#b32f47] truncate px-1">{paperKing}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button onClick={() => setPaperTarget('')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${paperTarget === '' ? 'bg-[#17a2d9] text-white' : 'bg-[#e6f2fb] text-[#4a7d97]'}`}>전체</button>
                {allProfiles.map(m => (
                  <button key={m.id} onClick={() => setPaperTarget(m.nickname)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${paperTarget === m.nickname ? 'bg-[#17a2d9] text-white' : 'bg-[#e6f2fb] text-[#4a7d97]'}`}>{m.nickname}</button>
                ))}
              </div>
            </div>

            {visiblePapers.length === 0 ? (
              <div className="text-center py-16 text-[#6d94ac] bg-[#ffffff] rounded-3xl border border-dashed border-[#b9dcf0]">
                <p className="font-bold mb-1">아직 남겨진 편지가 없습니다.</p>
                <p className="text-xs text-[#87a9bd]">첫 편지를 남겨보세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visiblePapers.map(p => (
                  <div key={p.id} className="bg-[#ffffff] rounded-2xl border border-[#cfe6f5] shadow-[0_4px_16px_rgba(20,110,150,0.07)] overflow-hidden">
                    <div className="bg-[#fff1f4] px-4 py-2 flex items-center justify-between border-b border-[#ffd6de]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-base leading-none">{p.mood || '💌'}</span>
                        <span className="text-xs font-bold text-[#b32f47] truncate">To. {p.to_nickname}</span>
                      </div>
                      {p.author_id === user.id && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => openPaperEdit(p)} title="수정" className="text-[#e8a5b0] hover:text-[#b32f47] p-1"><Icons.Edit /></button>
                          <button onClick={() => handleDeletePaper(p)} title="삭제" className="text-[#e8a5b0] hover:text-[#b32f47] p-1"><Icons.Trash /></button>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      {p.title && <div className="text-sm font-extrabold text-[#0f3f57] mb-1.5">{p.title}</div>}
                      <p className="text-sm text-[#265d75] whitespace-pre-wrap leading-relaxed">{p.message}</p>
                      {p.point && (
                        <span className="inline-block mt-3 text-[10px] font-bold bg-[#cfeafa] text-[#06465f] px-2 py-1 rounded-md">🌿 {p.point}</span>
                      )}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#eef7fe]">
                        <span className="text-[11px] font-bold text-[#4a7d97]">
                          From. {p.is_anonymous ? '익명 💗' : p.author_name}
                        </span>
                        <span className="text-[10px] text-[#87a9bd]">
                          {(p.created_at || '').split('T')[0]}{p.updated_at ? ' (수정됨)' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
          <div className="bg-[#ffffff] p-6 md:p-8 rounded-3xl border border-[#cfe6f5] shadow-[0_6px_24px_rgba(20,110,150,0.08)] h-full"><div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-[#0f3f57] flex items-center gap-2"><Icons.Admin /> 회원 관리</h3><div className="flex gap-2"><button onClick={() => setIsClassModalOpen(true)} className="flex items-center gap-2 bg-[#ffffff] border border-[#cfe6f5] text-[#265d75] px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#eef7fe] transition-all active:scale-95"><Icons.Edit /> 직업 목록 관리</button><button onClick={openDungeonModal} className="flex items-center gap-2 bg-[#17a2d9] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0e8ec0] transition-all shadow-md active:scale-95"><Icons.Edit /> 던전 목록 관리</button></div></div><div className="space-y-4">{allProfiles.map(member => (<div key={member.id} className="flex items-center justify-between bg-[#eef7fe] p-4 rounded-2xl border border-[#cfe6f5] shadow-[0_4px_16px_rgba(20,110,150,0.07)]"><div className="flex items-center gap-4">{renderAvatar(member.game_class, "w-10 h-10")}<div><div className="font-bold text-[#0f3f57] flex items-center gap-2">{member.nickname} {member.role === 'admin' && <span className="bg-[#17a2d9] text-white text-[10px] px-2 py-0.5 rounded-full">ADMIN</span>}</div><div className="text-xs text-[#5d87a1]">{member.game_class}</div></div></div>{member.id !== user.id && member.role !== 'admin' && (<button onClick={() => handleDeleteMember(member.id, member.nickname)} className="px-4 py-2 bg-[#ffe7eb] text-[#e0526a] rounded-xl text-xs font-bold hover:bg-[#ffd6de] transition-all">강퇴</button>)}</div>))}</div></div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/85 backdrop-blur-xl border-t border-[#cfe6f5] flex justify-around items-center py-2 z-40 pb-safe">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'home' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Home /><span className="text-[10px] font-bold">홈</span></button>
        <button onClick={() => setActiveTab('calendar')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'calendar' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Calendar /><span className="text-[10px] font-bold">달력</span></button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'stats' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Chart /><span className="text-[10px] font-bold">순위</span></button>
        <button onClick={() => setActiveTab('paper')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'paper' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Heart /><span className="text-[10px] font-bold">롤링</span></button>
        <button onClick={() => setActiveTab('board')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'board' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Board /><span className="text-[10px] font-bold">팁</span></button>
        <button onClick={() => setActiveTab('voice')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'voice' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Mic /><span className="text-[10px] font-bold">보이스</span></button>
        {isAdmin && <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${activeTab === 'admin' ? 'text-[#0b7fae]' : 'text-[#6d94ac]'}`}><Icons.Admin /><span className="text-[10px] font-bold">관리</span></button>}
      </nav>

      {/* --- 모달들 (기존과 동일) --- */}
      {isProfileModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-6 md:p-8 rounded-[2rem] shadow-2xl w-full max-w-sm text-center"><h2 className="text-2xl font-bold mb-2 text-[#0f3f57]">{myProfile ? '프로필 수정' : '환영합니다!'}</h2><p className="text-[#5d87a1] mb-8 text-sm">정보를 입력해주세요.</p><div className="space-y-5"><div className="text-left"><label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">닉네임</label><input className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] transition-all" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} /></div><div className="text-left"><label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">직업</label><select className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] cursor-pointer appearance-none" value={newClass} onChange={(e) => setNewClass(e.target.value)}>{classNames().map(cls => (<option key={cls} value={cls}>{cls}</option>))}</select></div><div className="text-left"><label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">인게임 캐릭터명</label><input className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] transition-all" placeholder="랭킹에 표시할 캐릭터명" value={newCharName} onChange={(e) => setNewCharName(e.target.value)} /><p className="text-[10px] text-[#87a9bd] mt-1.5 ml-1">공식 랭킹 1,000위 안에 들면 점수가 자동으로 채워집니다.</p></div><div className="text-left"><label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">어비스 기갱 (선택)</label><div className="space-y-2">{GIGAENG.map(g => (<div key={g.key} className="flex items-center gap-2"><span className="w-11 shrink-0 text-center text-[11px] font-extrabold py-2 rounded-lg" style={{ background: g.soft, color: g.color }}>{g.label}</span><input className="flex-1 min-w-0 bg-[#eef7fe] px-2 py-2.5 rounded-xl font-bold text-center text-sm outline-none focus:ring-2 focus:ring-[#17a2d9]" inputMode="numeric" placeholder="점수" value={gig[`${g.key}_score`] || ''} onChange={(e) => setGig({ ...gig, [`${g.key}_score`]: e.target.value })} /><input className="w-20 shrink-0 bg-[#eef7fe] px-2 py-2.5 rounded-xl font-bold text-center text-sm outline-none focus:ring-2 focus:ring-[#17a2d9]" inputMode="numeric" placeholder="초" value={gig[`${g.key}_seconds`] || ''} onChange={(e) => setGig({ ...gig, [`${g.key}_seconds`]: e.target.value })} /></div>))}</div><p className="text-[10px] text-[#87a9bd] mt-2 ml-1 leading-relaxed">비워두어도 됩니다. PC에서 자동 전송을 쓰면 접속할 때마다 갱신됩니다.</p>{myProfile?.ingest_token && (<div className="mt-2 bg-[#eef7fe] rounded-xl p-2.5"><div className="text-[10px] font-bold text-[#6d94ac] mb-1">내 전송 토큰</div><code className="block text-[10px] text-[#4a7d97] break-all select-all">{myProfile.ingest_token}</code></div>)}</div><div className="bg-[#e4f4fd] p-4 rounded-2xl flex flex-col items-center justify-center gap-2 border border-[#cfeafa]"><span className="text-xs font-bold text-[#0b7fae]">미리보기</span>{renderAvatar(newClass, "w-16 h-16")}</div></div><div className="flex gap-3 mt-8">{myProfile && <button onClick={() => setIsProfileModalOpen(false)} className="flex-1 py-4 bg-[#e6f2fb] text-[#4a7d97] rounded-2xl font-bold hover:bg-[#d9edf9]">취소</button>}<button onClick={handleSaveProfile} className="flex-1 bg-[#17a2d9] text-white py-4 rounded-2xl font-bold hover:bg-[#0e8ec0] shadow-lg transition-all">저장</button></div></div></div>)}
      
      {/* ★ 등록 모달 (날짜 선택 수정됨) */}
      {isCreateModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative"><h2 className="text-2xl font-bold mb-1 text-[#0f3f57]">일정 등록</h2><input type="date" className="w-full bg-[#eef7fe] p-3 rounded-xl mb-6 outline-none focus:ring-2 focus:ring-[#17a2d9] font-medium text-[#4a7d97] cursor-pointer" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /><div className="flex bg-[#e6f2fb] p-1 rounded-xl mb-4">{CALENDARS.map(c => (<button key={c.key} onClick={() => setRaidType(c.key)} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${raidType === c.key ? 'bg-[#ffffff] shadow-sm' : 'text-[#6d94ac]'}`} style={raidType === c.key ? { color: c.full } : undefined}>{c.label}</button>))}</div><div className="mb-6 text-left">
        <div className="flex items-center justify-between mb-2 px-1">
          <label className="block text-xs font-bold text-[#6d94ac]">던전 선택</label>
          {/* ★ 관리자만 보이게 하려면 아래 true 를 isAdmin 으로 바꾸세요 */}
          {true && (<button onClick={openDungeonModal} className="flex items-center gap-1 text-xs font-bold text-[#0b7fae] hover:text-[#075f84] transition-colors"><Icons.Edit /> 목록 편집</button>)}
        </div>
        <select className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] cursor-pointer appearance-none text-lg" value={selectedDungeon} onChange={(e) => setSelectedDungeon(e.target.value)}>{dungeonList(calOf(raidType).dungeonType).map(dungeon => (<option key={dungeon} value={dungeon}>{dungeon}</option>))}</select>
      </div><div className="flex gap-3 mb-8"><button onClick={() => setMaxMembers(4)} className={`flex-1 py-3 rounded-2xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${maxMembers === 4 ? 'border-[#17a2d9] bg-[#e4f4fd] text-[#075f84]' : 'border-[#cfe6f5] text-[#6d94ac] hover:border-[#a7d1e9]'}`}><div className="flex gap-1"><Icons.UserGroup /><span className="text-lg">4</span></div><span className="text-xs">파티</span></button><button onClick={() => setMaxMembers(8)} className={`flex-1 py-3 rounded-2xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${maxMembers === 8 ? 'border-[#17a2d9] bg-[#e4f4fd] text-[#075f84]' : 'border-[#cfe6f5] text-[#6d94ac] hover:border-[#a7d1e9]'}`}><div className="flex gap-1"><Icons.UserGroup /><span className="text-lg">8</span></div><span className="text-xs">공대</span></button></div><div className="flex gap-3"><button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 bg-[#e6f2fb] text-[#4a7d97] rounded-2xl font-bold hover:bg-[#d9edf9] transition-colors">취소</button><button onClick={handleCreate} className="flex-1 py-4 bg-[#17a2d9] text-white rounded-2xl font-bold hover:bg-[#0e8ec0] shadow-lg transition-all">등록</button></div></div></div>)}

      {isWriteModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative"><h2 className="text-2xl font-bold mb-6 text-[#0f3f57] flex items-center gap-2"><Icons.Board /> 팁 작성하기</h2><input className="w-full bg-[#eef7fe] p-4 rounded-2xl mb-4 outline-none focus:ring-2 focus:ring-[#17a2d9] transition-all font-bold" placeholder="제목을 입력하세요" value={postTitle} onChange={e => setPostTitle(e.target.value)} autoFocus /><textarea className="w-full bg-[#eef7fe] p-4 rounded-2xl mb-8 outline-none focus:ring-2 focus:ring-[#17a2d9] transition-all h-40 resize-none" placeholder="내용을 작성해주세요." value={postContent} onChange={e => setPostContent(e.target.value)} /><div className="mb-6"><div className="flex gap-2 mb-2"><div className="flex-1"><input type="file" accept="image/*" id="img-upload" className="hidden" onChange={handleImageSelect} /><label htmlFor="img-upload" className="flex items-center justify-center gap-2 w-full py-3 bg-[#e6f2fb] rounded-xl cursor-pointer hover:bg-[#d9edf9] transition-all text-xs font-bold border border-dashed border-[#a7d1e9]"><Icons.Camera /> {selectedImage ? '사진 변경' : '사진 첨부'}</label></div><div className="flex-1"><input type="file" id="file-upload" className="hidden" onChange={handleFileSelect} /><label htmlFor="file-upload" className="flex items-center justify-center gap-2 w-full py-3 bg-[#e6f2fb] rounded-xl cursor-pointer hover:bg-[#d9edf9] transition-all text-xs font-bold border border-dashed border-[#a7d1e9]"><Icons.Clip /> {selectedFile ? '파일 변경' : '파일 첨부'}</label></div></div>{(previewUrl || selectedFile) && (<div className="space-y-2">{previewUrl && (<div className="relative w-full h-32 rounded-xl overflow-hidden border border-[#b9dcf0]"><img src={previewUrl} className="w-full h-full object-cover" alt="미리보기" /><button onClick={() => { setSelectedImage(null); setPreviewUrl(''); }} className="absolute top-1 right-1 bg-[#0d3c52]/45 text-white rounded-full p-1"><Icons.Close /></button></div>)}{selectedFile && (<div className="flex items-center justify-between bg-[#e4f4fd] p-3 rounded-xl border border-[#cfeafa]"><div className="flex items-center gap-2 overflow-hidden"><Icons.File /><span className="text-xs font-bold text-[#075f84] truncate">{selectedFile.name}</span></div><button onClick={() => setSelectedFile(null)} className="text-[#6d94ac] hover:text-[#e0526a]"><Icons.Close /></button></div>)}</div>)}</div><div className="flex gap-3"><button onClick={() => setIsWriteModalOpen(false)} className="flex-1 py-4 bg-[#e6f2fb] text-[#4a7d97] rounded-2xl font-bold hover:bg-[#d9edf9] transition-colors">취소</button><button onClick={handleWritePost} disabled={uploading} className="flex-1 py-4 bg-[#17a2d9] text-white rounded-2xl font-bold hover:bg-[#0e8ec0] shadow-lg transition-all disabled:bg-[#8fb9cf]">{uploading ? '업로드 중...' : '작성완료'}</button></div></div></div>)}
      {isDetailModalOpen && (<div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[9999] p-4 animate-in fade-in zoom-in-95 duration-200"><div className="bg-[#ffffff] p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative overflow-hidden"><div className={`absolute top-0 left-0 w-full h-2 ${selectedRaid?.title?.includes('어비스') || selectedRaid?.title?.includes('지옥') ? 'bg-[#17a2d9]' : 'bg-[#ff7a8a]'}`}></div><div className="absolute top-5 right-5 flex gap-2">{isMyRaid && (<button onClick={handleDeleteRaid} className="text-[#87a9bd] hover:text-[#e0526a] p-2 transition-all"><Icons.Trash /></button>)}<button onClick={() => setIsDetailModalOpen(false)} className="text-[#87a9bd] hover:text-[#0f3f57] p-2 transition-all"><Icons.Close /></button></div><h2 className="text-2xl font-extrabold mb-2 pr-20 text-[#0f3f57] leading-tight">{selectedRaid?.title}</h2><div className="flex items-center gap-2 mb-6 bg-[#eef7fe] p-2 rounded-xl border border-[#cfe6f5] w-fit"><span className="text-xs text-[#6d94ac] font-bold">HOST</span>{selectedRaid?.host_avatar && renderAvatar(selectedRaid.host_avatar, "w-5 h-5")}<span className="text-sm font-bold text-[#265d75]">{selectedRaid?.host_name || '알수없음'}</span></div><div className="bg-[#eef7fe] p-5 rounded-3xl mb-6 border border-[#cfe6f5]">
  <p className="text-xs font-bold text-[#6d94ac] mb-3 uppercase tracking-wider flex items-center justify-between">
    <span>참가자 현황</span>
    <span className={`px-2 py-1 rounded-full text-xs ${selectedRaid?.is_closed ? 'bg-[#e6edf1] text-[#5b6b76]' : slotState.isFull ? 'bg-[#ffe7eb] text-[#e0526a]' : 'bg-[#cfeafa] text-[#0b7fae]'}`}>
      {selectedRaid?.is_closed ? '마감' : slotState.isFull ? '모집완료' : '모집중'} · {participants.length} / {slotState.max}명
    </span>
  </p>

  {/* ★ 크레이지 아케이드식 자리 배치 — 4인 2x2, 8인 4x2 */}
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${slotState.cols}, minmax(0, 1fr))` }}>
    {slotState.slots.map(slot => {
      const canEdit = isAdmin || selectedRaid?.created_by_email === user.email;
      if (slot.kind === 'member') {
        const p: any = slot.member;
        const isMe = p.user_email === user.email;
        return (
          <div key={slot.index}
            className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 p-1 transition-all ${isMe ? 'bg-[#e4f4fd] border-[#17a2d9]' : 'bg-[#ffffff] border-[#cfe6f5]'}`}>
            {renderAvatar(p.game_class, "w-9 h-9")}
            <span className="text-[11px] font-bold text-[#0f3f57] truncate max-w-full px-1">{p.user_name}</span>
            <span className="text-[9px] text-[#6d94ac] truncate max-w-full px-1">{p.game_class}</span>
          </div>
        );
      }
      if (slot.kind === 'blocked') {
        return (
          <button key={slot.index} onClick={() => toggleSlotBlock(slot.index)} disabled={!canEdit}
            title={canEdit ? '눌러서 자리 열기' : '닫힌 자리입니다'}
            className={`aspect-square rounded-2xl border-2 border-dashed border-[#b9dcf0] bg-[#e6f2fb] flex items-center justify-center relative overflow-hidden ${canEdit ? 'hover:border-[#8fb9cf] cursor-pointer' : 'cursor-default'}`}>
            <span className="text-[#a7d1e9] text-4xl font-thin leading-none select-none">✕</span>
          </button>
        );
      }
      return (
        <button key={slot.index} onClick={() => toggleSlotBlock(slot.index)} disabled={!canEdit}
          title={canEdit ? '눌러서 자리 잠그기' : '빈 자리'}
          className={`aspect-square rounded-2xl border-2 border-dashed border-[#cfe6f5] bg-[#ffffff] flex items-center justify-center transition-all ${canEdit ? 'hover:border-[#17a2d9] hover:bg-[#f5fbff] cursor-pointer' : 'cursor-default'}`}>
          <span className="text-[11px] font-bold text-[#a7d1e9]">빈자리</span>
        </button>
      );
    })}
  </div>

  {(isAdmin || selectedRaid?.created_by_email === user.email) && (
    <p className="text-[10px] text-[#87a9bd] mt-3 text-center leading-relaxed">
      빈 칸을 누르면 자리를 잠글 수 있습니다. 인원이 덜 차도 남는 자리를 잠그면 모집완료가 됩니다.
    </p>
  )}
</div>{(isAdmin || selectedRaid?.created_by_email === user.email) && (
  <button onClick={toggleRaidClosed}
    className={`w-full mb-2 py-3 rounded-2xl font-bold text-sm transition-all border ${selectedRaid?.is_closed
      ? 'bg-[#8fa3ae] border-[#8fa3ae] text-white'
      : 'bg-[#ffffff] border-[#cfe6f5] text-[#4a7d97] hover:bg-[#eef7fe]'}`}>
    {selectedRaid?.is_closed ? '✅ 마감됨 — 되돌리려면 누르세요' : '🏁 마감하기 (던전 완료)'}
  </button>
)}
<div className="space-y-2">{isJoined ? (<><button onClick={handleAddToCalendar} className="w-full py-3 bg-[#e6f2fb] text-[#265d75] rounded-2xl font-bold hover:bg-[#d9edf9] text-sm flex justify-center items-center gap-2"><Icons.GoogleCal /> 구글 캘린더에 추가</button><button onClick={handleLeave} className="w-full py-4 bg-[#fff1f4] text-[#e0526a] rounded-2xl font-bold hover:bg-[#ffdde4] text-lg transition-all">참가 취소</button></>) : (<button onClick={handleJoin} disabled={slotState.isFull} className={`w-full py-4 text-white rounded-2xl font-bold text-lg transition-all shadow-lg ${slotState.isFull ? 'bg-[#8fb9cf] cursor-not-allowed' : 'bg-[#17a2d9] hover:bg-[#0e8ec0] active:scale-95'}`}>{slotState.isFull ? '모집 마감' : '참가하기'}</button>)}</div></div></div>)}

      {/* ★ 롤링페이퍼 작성 모달 */}
      {isPaperModalOpen && (
        <div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[10000] p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[#ffffff] rounded-[2rem] shadow-2xl w-full max-w-sm flex flex-col max-h-[88vh] overflow-hidden">
            <div className="bg-[#fff1f4] px-6 py-4 flex items-center justify-between border-b border-[#ffd6de]">
              <h2 className="text-lg font-bold text-[#b32f47]">💌 롤링페이퍼 {editingPaperId ? '수정' : '남기기'}</h2>
              <button onClick={() => setIsPaperModalOpen(false)} className="text-[#e8a5b0] hover:text-[#b32f47] p-1"><Icons.Close /></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="text-left">
                <label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">누구에게 💗</label>
                <select className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-center outline-none focus:ring-2 focus:ring-[#17a2d9] cursor-pointer appearance-none" value={pTo} onChange={e => setPTo(e.target.value)}>
                  <option value="">선택해주세요</option>
                  {allProfiles.map(m => <option key={m.id} value={m.nickname}>{m.nickname}</option>)}
                </select>
              </div>

              <div className="text-left">
                <label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">무드 ✨</label>
                <div className="flex flex-wrap gap-1.5">
                  {MOODS.map(m => (
                    <button key={m} onClick={() => setPMood(m)} className={`w-10 h-10 rounded-xl text-lg transition-all ${pMood === m ? 'bg-[#cfeafa] ring-2 ring-[#17a2d9]' : 'bg-[#eef7fe] hover:bg-[#e4f4fd]'}`}>{m}</button>
                  ))}
                </div>
              </div>

              <div className="text-left">
                <label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">한줄 제목 🏷️</label>
                <input className="w-full bg-[#eef7fe] p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-[#17a2d9]" placeholder="예) 생생정보통 저리가라급" value={pTitle} onChange={e => setPTitle(e.target.value)} />
              </div>

              <div className="text-left">
                <label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">롤링 메시지 💬</label>
                <textarea rows={4} className="w-full bg-[#eef7fe] p-4 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#17a2d9] resize-none leading-relaxed" placeholder="추억 하나, 칭찬 하나, 응원 한마디" value={pMsg} onChange={e => setPMsg(e.target.value)} />
              </div>

              <div className="text-left">
                <label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">읽는 맛 포인트 🌿 (선택)</label>
                <input className="w-full bg-[#eef7fe] p-4 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#17a2d9]" placeholder="예) 생생정보통" value={pPoint} onChange={e => setPPoint(e.target.value)} />
              </div>

              <button onClick={() => setPAnon(!pAnon)} className={`w-full p-3.5 rounded-2xl text-sm font-bold transition-all border ${pAnon ? 'bg-[#fff1f4] border-[#ffd6de] text-[#b32f47]' : 'bg-[#eef7fe] border-[#cfe6f5] text-[#4a7d97]'}`}>
                {pAnon ? '💗 익명으로 남기기 (켜짐)' : `✍️ ${myProfile?.nickname || ''} 이름으로 남기기`}
              </button>
              <p className="text-[10px] text-[#87a9bd] text-center leading-relaxed">
                드립 치고 싶으면 공개, 진심 쓰고 싶으면 익명이 좋습니다.<br />읽었을 때 기분 좋은 선에서 써주세요.
              </p>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => { setIsPaperModalOpen(false); setEditingPaperId(null); }} className="flex-1 py-4 bg-[#e6f2fb] text-[#4a7d97] rounded-2xl font-bold hover:bg-[#d9edf9]">취소</button>
              <button onClick={handleSavePaper} className="flex-1 bg-[#ff7a8a] text-white py-4 rounded-2xl font-bold hover:bg-[#e0526a] shadow-lg transition-all">{editingPaperId ? '수정 완료' : '남기기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ★ 직업 목록 관리 모달 (관리자 전용) */}
      {isClassModalOpen && (
        <div className="fixed inset-0 bg-[#0d3c52]/45 backdrop-blur-md flex justify-center items-center z-[10000] p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[#ffffff] p-6 md:p-8 rounded-[2rem] shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#0f3f57]">직업 목록 관리</h2>
              <button onClick={() => setIsClassModalOpen(false)} className="text-[#a7d1e9] hover:text-[#0f3f57] p-1"><Icons.Close /></button>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 mb-4">
              {gameClasses.length === 0 ? (
                <div className="text-center py-8 bg-[#eef7fe] rounded-2xl border border-dashed border-[#cfe6f5]">
                  <p className="text-sm text-[#5d87a1] mb-1 font-bold">아직 DB에 저장된 직업이 없습니다.</p>
                  <p className="text-xs text-[#87a9bd] mb-4">지금은 코드에 있는 기본 목록이 쓰이고 있습니다.</p>
                  <button onClick={handleSeedClasses} className="px-5 py-3 bg-[#17a2d9] text-white rounded-xl font-bold text-sm hover:bg-[#0e8ec0]">기본 목록 불러오기</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {gameClasses.map(row => (
                    <div key={row.id} className="flex items-center gap-2 bg-[#eef7fe] p-2 rounded-2xl border border-[#cfe6f5]">
                      <label className="shrink-0 cursor-pointer relative group" title="눌러서 아이콘 바꾸기">
                        <img src={row.icon_url || '/class-icons/default.png'} alt={row.name}
                          className="w-10 h-10 rounded-full object-cover border border-[#b9dcf0] bg-[#ffffff]"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/class-icons/default.png'; }} />
                        <span className="absolute inset-0 rounded-full bg-[#0d3c52]/0 group-hover:bg-[#0d3c52]/45 flex items-center justify-center text-white text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-all">변경</span>
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleChangeClassIcon(row, f); e.target.value = ''; }} />
                      </label>

                      {editingClassId === row.id ? (
                        <>
                          <input className="flex-1 min-w-0 bg-[#ffffff] px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-[#17a2d9]"
                            value={editingClassName} onChange={e => setEditingClassName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameClass(row); if (e.key === 'Escape') setEditingClassId(null); }} autoFocus />
                          <button onClick={() => handleRenameClass(row)} className="px-3 py-2 bg-[#17a2d9] text-white rounded-xl text-xs font-bold shrink-0">저장</button>
                          <button onClick={() => setEditingClassId(null)} className="px-3 py-2 bg-[#e6f2fb] text-[#4a7d97] rounded-xl text-xs font-bold shrink-0">취소</button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 px-1 font-bold text-sm text-[#0f3f57] truncate">{row.name}</span>
                          <button onClick={() => { setEditingClassId(row.id); setEditingClassName(row.name); }} className="p-2 text-[#87a9bd] hover:text-[#0b7fae] hover:bg-[#ffffff] rounded-lg shrink-0" title="이름 수정"><Icons.Edit /></button>
                          <button onClick={() => handleDeleteClass(row)} className="p-2 text-[#87a9bd] hover:text-[#e0526a] hover:bg-[#ffffff] rounded-lg shrink-0" title="삭제"><Icons.Trash /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[#cfe6f5] pt-4">
              <label className="block text-xs font-bold text-[#6d94ac] mb-2 ml-1">새 직업 추가</label>
              <div className="flex gap-2 items-center">
                <label className="shrink-0 w-12 h-12 rounded-xl border-2 border-dashed border-[#cfe6f5] flex items-center justify-center cursor-pointer hover:border-[#17a2d9] overflow-hidden" title="아이콘 선택">
                  {newClassIcon
                    ? <img src={URL.createObjectURL(newClassIcon)} alt="" className="w-full h-full object-cover" />
                    : <span className="text-[#a7d1e9] text-xl leading-none">+</span>}
                  <input type="file" accept="image/*" className="hidden" onChange={e => setNewClassIcon(e.target.files?.[0] || null)} />
                </label>
                <input className="flex-1 min-w-0 bg-[#eef7fe] px-4 py-3 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-[#17a2d9]"
                  placeholder="예) 마검사" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddClass(); }} />
                <button onClick={handleAddClass} disabled={classBusy}
                  className={`px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all shrink-0 ${classBusy ? 'bg-[#8fb9cf] text-white cursor-wait' : 'bg-[#17a2d9] text-white hover:bg-[#0e8ec0]'}`}>
                  {classBusy ? '...' : '추가'}
                </button>
              </div>
              <p className="text-[10px] text-[#87a9bd] mt-2 ml-1">아이콘은 정사각형 이미지가 가장 잘 어울립니다. 비워두면 기본 아이콘이 쓰입니다.</p>
            </div>
          </div>
        </div>
      )}

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