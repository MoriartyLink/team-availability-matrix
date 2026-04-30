/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TeamMember } from './types';

export const MOCK_TEAM: TeamMember[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    role: 'Product Lead',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    status: 'available',
    color: '#3B82F6', // Blue
  },
  {
    id: '2',
    name: 'Marcus Thorne',
    role: 'Eng Manager',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    status: 'busy',
    color: '#EF4444', // Red
  },
  {
    id: '3',
    name: 'Elena Rodriguez',
    role: 'UX Designer',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
    status: 'available',
    color: '#10B981', // Green
  },
  {
    id: '4',
    name: 'David Kim',
    role: 'Frontend Dev',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop',
    status: 'away',
    color: '#F59E0B', // Amber
  },
  {
    id: '5',
    name: 'Jordan Smith',
    role: 'Backend Dev',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop',
    status: 'available',
    color: '#8B5CF6', // Purple
  }
];

export const WORK_HOURS = {
  start: 9, // 9 AM
  end: 18,  // 6 PM
};
