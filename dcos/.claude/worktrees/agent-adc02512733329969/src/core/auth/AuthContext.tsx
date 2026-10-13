import React, { createContext, useContext, useState, useCallback } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  operatorId: string;
  operatorName: string;
  /** Customer (tenant) the user's new records belong to; the platform tenant applies when unset. */
  customerId?: string;
  avatar?: string;
}

interface AuthContextType {
  user: User;
  switchUser: (userId: string) => void;
  users: User[];
}

const SEED_USERS: User[] = [
  { id: 'U01', name: 'Admin User', email: 'admin@ran.io', roleId: 'R01', roleName: 'System Administrator', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U02', name: 'Sarah Chen', email: 'sarah.chen@ran.io', roleId: 'R02', roleName: 'Program Manager', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U03', name: 'Mike Johnson', email: 'mike.j@ran.io', roleId: 'R03', roleName: 'Project Manager', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U04', name: 'Emily Roberts', email: 'emily.r@ran.io', roleId: 'R04', roleName: 'Site Acquisition Manager', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U05', name: 'David Kim', email: 'david.k@ran.io', roleId: 'R06', roleName: 'RF Design Engineer', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U06', name: 'Lisa Park', email: 'lisa.p@ran.io', roleId: 'R07', roleName: 'MW Planning Engineer', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U07', name: 'James Wilson', email: 'james.w@ran.io', roleId: 'R12', roleName: 'Field Engineer / Installer', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U08', name: 'Anna Martinez', email: 'anna.m@ran.io', roleId: 'R16', roleName: 'Quality / Acceptance Engineer', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U09', name: 'Robert Brown', email: 'robert.b@ran.io', roleId: 'R18', roleName: 'Commercial / Finance Manager', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U10', name: 'Karen Lee', email: 'karen.l@ran.io', roleId: 'R24', roleName: 'Executive / Leadership', operatorId: 'OP1', operatorName: 'TelecoMax' },
  { id: 'U11', name: 'Tom Garcia', email: 'tom.g@vendorco.io', roleId: 'R19', roleName: 'Vendor Project Manager', operatorId: 'OP2', operatorName: 'NetBuild Corp' },
  { id: 'U12', name: 'Nina Patel', email: 'nina.p@ran.io', roleId: 'R23', roleName: 'Crew Dispatcher', operatorId: 'OP1', operatorName: 'TelecoMax' },
];

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUserId, setCurrentUserId] = useState('U03');

  const switchUser = useCallback((userId: string) => {
    setCurrentUserId(userId);
  }, []);

  const user = SEED_USERS.find(u => u.id === currentUserId) || SEED_USERS[0];

  return (
    <AuthContext.Provider value={{ user, switchUser, users: SEED_USERS }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
