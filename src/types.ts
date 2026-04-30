/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: 'available' | 'busy' | 'away';
  color: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  type: 'busy' | 'free' | 'tentative';
  label?: string;
}

export interface AvailabilityData {
  userId: string;
  slots: TimeSlot[];
}
