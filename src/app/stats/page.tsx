'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Link from 'next/link';

export default function StatsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    // 1. 모든 참가 기록 가져오기
    const { data: participants, error } = await supabase
      .from('participants')
      .select('user_name, game_class');

    if (error || !participants) {
      setLoading(false);
      return;
    }

    // 2. 데이터 가공: 이름별로 몇 번 참가했는지 세기
    const countMap: { [key: string]: { count: number; job: string } } = {};

    participants.forEach((p) => {
      if (countMap[p.user_name]) {
        countMap[p.user_name].count += 1;
      } else {
        countMap[p.user_name] = { count: 1, job: p.game_class || '모험가' };
      }
    });

    // 3. 차트에 넣기 좋게 배열로 변환 & 많이 참가한 순서로 정렬
    const chartData = Object.keys(countMap)
      .map((name) => ({
        name: name,
        count: countMap[name].count,
        job: countMap[name].job,
      }))
      .sort((a, b) => b.count - a.count); // 내림차순 정렬

    setData(chartData);
    setLoading(false);
  };

  // 랭킹 1, 2, 3등에게 줄 금은동 색깔
  const getBarColor = (index: number) => {
    if (index === 0) return '#FFD700'; // 금색
    if (index === 1) return '#C0C0C0'; // 은색
    if (index === 2) return '#CD7F32'; // 동색
    return '#818cf8'; // 나머지는 연한 보라색
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">분석중...</div>;

  return (
    <div className="min-h-screen bg-[#161826] p-4 md:p-10">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 & 뒤로가기 버튼 */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-[#e9e9ed]">🏆 길드 레이드 참여 랭킹</h1>
          <Link href="/" className="px-4 py-2 bg-[#232532] border rounded-xl shadow-sm hover:bg-[#20222f] font-bold text-[#a8aab8] transition-colors">
            ← 달력으로 돌아가기
          </Link>
        </div>

        {/* 차트 영역 */}
        <div className="bg-[#232532] p-6 md:p-10 rounded-[2rem] shadow-xl border border-[#2c2f3d]">
          <h2 className="text-xl font-bold mb-6 text-[#b5abfc]">참여 횟수 TOP {data.length}</h2>
          
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={80} 
                  tick={{ fontSize: 14, fontWeight: 'bold', fill: '#4b5563' }} 
                />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                />
                <Bar dataKey="count" barSize={30} radius={[0, 10, 10, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 텍스트 리스트로 보기 */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((user, index) => (
            <div key={user.name} className="bg-[#232532] p-4 rounded-2xl shadow-sm flex items-center justify-between border border-[#2c2f3d]">
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${index < 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-[#20222f] text-[#9397ab]'}`}>
                  {index + 1}
                </span>
                <div>
                  <div className="font-bold text-[#dcdce3]">{user.name}</div>
                  <div className="text-xs text-[#8b8fa3]">{user.job}</div>
                </div>
              </div>
              <div className="text-[#b5abfc] font-extrabold">{user.count}회</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}