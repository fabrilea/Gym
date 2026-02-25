import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

type UserItem = {
  id: string;
  userId?: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  dni?: string | null;
  phone?: string | null;
  plan?: string | null;
  planName?: string | null;
  planExpiresAt?: string | null;
  status?: string | null;
  memberStatus?: string | null;
  paidAt?: string | null;
  monthKey?: string | null;
  planEndDate?: string | null;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  paymentViewStatus?: 'ACTIVE' | 'INACTIVE';
  week1Checkins?: number;
  week2Checkins?: number;
  week3Checkins?: number;
  week4Checkins?: number;
  week5Checkins?: number;
  totalCheckins?: number;
  amountDue?: number;
  amountPaid?: number;
};

type UsersResponse = {
  data: UserItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type UserFormValues = {
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  plan: string;
  planExpiresAt: string;
  status: 'ACTIVE' | 'INACTIVE';
};

type UserFormErrors = Partial<Record<keyof UserFormValues, string>>;

type RenewalFormValues = {
  userId: string;
  memberNumber: string;
  fullName: string;
  monthKey: string;
  plan: string;
  paid: 'SI' | 'NO';
  amountDue: string;
};

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

type CheckinHistoryItem = {
  id: string;
  userId: string;
  checkinAt: string;
  user?: {
    memberNumber?: string;
    firstName?: string;
    lastName?: string;
    dni?: string | null;
    plan?: string | null;
  } | null;
};

type CheckinHistoryResponse = {
  data: CheckinHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type AdminItem = {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'OPERATOR';
  createdAt: string;
  updatedAt: string;
};

type AdminsResponse = {
  data: AdminItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type AdminFormValues = {
  dni: string;
  firstName: string;
  lastName: string;
  password: string;
};

type ExportJobResponse = {
  id: string;
};

type ExportJobDetailResponse = {
  downloadUrl: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const API_ORIGIN = getApiOrigin(API_URL);
const ADMIN_DNIS = parseAdminDnis(import.meta.env.VITE_ADMIN_DNI ?? '30123456');
const PLAN_OPTIONS = ['1_DIA', '2_DIAS', '3_DIAS', 'PASE_LIBRE'] as const;

const INITIAL_USER_FORM: UserFormValues = {
  firstName: '',
  lastName: '',
  dni: '',
  phone: '',
  plan: '',
  planExpiresAt: '',
  status: 'ACTIVE',
};

function App() {
  const [accessDni, setAccessDni] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchName, setSearchName] = useState('');
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey());
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState('');

  const [userForm, setUserForm] = useState<UserFormValues>(INITIAL_USER_FORM);
  const [userFormErrors, setUserFormErrors] = useState<UserFormErrors>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [renewalForm, setRenewalForm] = useState<RenewalFormValues | null>(null);
  const [renewalError, setRenewalError] = useState('');
  const [savingRenewal, setSavingRenewal] = useState(false);
  const [historyMonth, setHistoryMonth] = useState<number>(new Date().getMonth() + 1);
  const [historyYear, setHistoryYear] = useState<number>(new Date().getFullYear());
  const [historyItems, setHistoryItems] = useState<CheckinHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [downloadingAttendanceMonth, setDownloadingAttendanceMonth] = useState(false);
  const [downloadingAttendanceYear, setDownloadingAttendanceYear] = useState(false);
  const [downloadingMembers, setDownloadingMembers] = useState(false);
  const [adminView, setAdminView] = useState<'members' | 'admins'>('members');
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [adminsPage, setAdminsPage] = useState(1);
  const [adminsTotalPages, setAdminsTotalPages] = useState(1);
  const [adminsTotal, setAdminsTotal] = useState(0);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [adminsError, setAdminsError] = useState('');
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [deletingAdminId, setDeletingAdminId] = useState<string | null>(null);
  const [adminForm, setAdminForm] = useState<AdminFormValues>({
    dni: '',
    firstName: '',
    lastName: '',
    password: '',
  });

  const normalizedAccessDni = normalizeDni(accessDni);
  const isAdminAccess = isAdminDni(normalizedAccessDni);
  const isLoggedIn = Boolean(token);
  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!token) return;
    void loadUsers(token, 1, searchName, monthKey);
  }, [token, monthKey]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    void loadCheckinHistory(token, historyMonth, historyYear, 1);
  }, [token, isAdmin, historyMonth, historyYear]);

  useEffect(() => {
    if (!token || !isAdmin || adminView !== 'admins') return;
    void loadAdmins(token, 1);
  }, [token, isAdmin, adminView]);

  const onAccessSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    if (!normalizedAccessDni) {
      setAuthError('Ingresa un DNI válido');
      return;
    }

    if (isAdminAccess && password.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoadingLogin(true);

    try {
      if (isAdminAccess) {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dni: normalizedAccessDni, password }),
        });

        if (!response.ok) {
          const errorBody = await safeParseJson(response);
          throw new Error(errorBody?.message ?? 'No se pudo iniciar sesión');
        }

        const data = (await response.json()) as LoginResponse;
        const payload = decodeJwtPayload(data.accessToken);
        setToken(data.accessToken);
        setRole(payload?.role ?? null);
        setPage(1);
        await loadUsers(data.accessToken, 1, searchName, monthKey);
        return;
      }

      const response = await fetch(`${API_URL}/checkins/by-dni`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni: normalizedAccessDni }),
      });

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo registrar el ingreso');
      }

      setToast({ type: 'success', message: `Ingreso registrado para DNI ${normalizedAccessDni}` });
      setAccessDni('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      if (isAdminAccess) {
        setAuthError(message);
      } else {
        setToast({ type: 'error', message });
      }
    } finally {
      setLoadingLogin(false);
    }
  };

  const loadUsers = async (
    accessToken: string,
    nextPage: number,
    nameFilter: string,
    targetMonthKey: string,
  ) => {
    setLoadingUsers(true);
    setUsersError('');

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(limit),
        monthKey: targetMonthKey,
      });

      const normalizedName = nameFilter.trim();
      if (normalizedName) {
        params.set('name', normalizedName);
      }

      const response = await fetch(`${API_URL}/billing/monthly-status?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo cargar usuarios');
      }

      const data = (await response.json()) as UsersResponse;
      setUsers(
        data.data.map((item) => ({
          ...item,
          id: item.userId ?? item.id,
          plan: item.plan ?? item.planName ?? null,
          status: item.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
          planExpiresAt: item.planEndDate ?? item.planExpiresAt,
        })),
      );
      setPage(data.page);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setUsersError(message);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const onSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    await loadUsers(token, 1, searchName, monthKey);
  };

  const logout = () => {
    setToken('');
    setRole(null);
    setPassword('');
    setUsers([]);
    setPage(1);
    setTotalPages(1);
    setTotal(0);
    setUsersError('');
    resetForm();
    setAdminView('members');
    resetAdminForm();
  };

  const loadAdmins = async (accessToken: string, nextPage: number) => {
    setLoadingAdmins(true);
    setAdminsError('');

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(limit),
      });

      const response = await fetch(`${API_URL}/auth/admins?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo cargar admins');
      }

      const data = (await response.json()) as AdminsResponse;
      setAdmins(data.data);
      setAdminsPage(data.page);
      setAdminsTotalPages(data.totalPages || 1);
      setAdminsTotal(data.total);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setAdminsError(message);
      setAdmins([]);
      setAdminsPage(1);
      setAdminsTotalPages(1);
      setAdminsTotal(0);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const onAdminFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !isAdmin) return;

    const dni = adminForm.dni.trim();
    const firstName = adminForm.firstName.trim();
    const lastName = adminForm.lastName.trim();

    if (!dni || !firstName || !lastName) {
      setAdminsError('DNI, nombre y apellido son obligatorios');
      return;
    }

    if (!editingAdminId && adminForm.password.trim().length < 6) {
      setAdminsError('La contraseña es obligatoria y debe tener al menos 6 caracteres');
      return;
    }

    setSavingAdmin(true);
    setAdminsError('');

    try {
      if (editingAdminId) {
        const payload: Record<string, string> = {
          dni,
          firstName,
          lastName,
        };

        if (adminForm.password.trim()) {
          payload.password = adminForm.password.trim();
        }

        const response = await fetch(`${API_URL}/auth/admins/${editingAdminId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorBody = await safeParseJson(response);
          throw new Error(errorBody?.message ?? 'No se pudo actualizar admin');
        }

        setToast({ type: 'success', message: 'Admin actualizado correctamente' });
      } else {
        const response = await fetch(`${API_URL}/auth/register-admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            dni,
            firstName,
            lastName,
            password: adminForm.password.trim(),
          }),
        });

        if (!response.ok) {
          const errorBody = await safeParseJson(response);
          throw new Error(errorBody?.message ?? 'No se pudo crear admin');
        }

        setToast({ type: 'success', message: 'Admin creado correctamente' });
      }

      resetAdminForm();
      await loadAdmins(token, adminsPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setAdminsError(message);
    } finally {
      setSavingAdmin(false);
    }
  };

  const onEditAdmin = (admin: AdminItem) => {
    setEditingAdminId(admin.id);
    setAdminsError('');
    setAdminForm({
      dni: admin.dni,
      firstName: admin.firstName,
      lastName: admin.lastName,
      password: '',
    });
  };

  const onDeleteAdmin = async (adminId: string) => {
    if (!token || !isAdmin) return;
    const confirmed = window.confirm('¿Seguro que quieres eliminar este admin?');
    if (!confirmed) return;

    setDeletingAdminId(adminId);
    setAdminsError('');

    try {
      const response = await fetch(`${API_URL}/auth/admins/${adminId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo eliminar admin');
      }

      if (editingAdminId === adminId) {
        resetAdminForm();
      }

      const targetPage = admins.length === 1 && adminsPage > 1 ? adminsPage - 1 : adminsPage;
      await loadAdmins(token, targetPage);
      setToast({ type: 'success', message: 'Admin eliminado correctamente' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setAdminsError(message);
    } finally {
      setDeletingAdminId(null);
    }
  };

  const onUserFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !isAdmin) return;

    setSavingUser(true);
    setFormError('');
    const nextErrors = validateUserForm(userForm);
    setUserFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSavingUser(false);
      return;
    }

    try {
      const payload = buildUserPayload(userForm);
      const isEditing = Boolean(editingUserId);

      const response = await fetch(
        isEditing ? `${API_URL}/users/${editingUserId}` : `${API_URL}/users`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo guardar el socio');
      }

      const savedUser = (await response.json()) as { id: string };
      const targetUserId = editingUserId ?? savedUser.id;

      if (targetUserId) {
        const upsertPaymentResponse = await fetch(`${API_URL}/billing/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: targetUserId,
            monthKey,
            amountDue: 1,
            amountPaid: userForm.status === 'ACTIVE' ? 1 : 0,
            paidAt: userForm.status === 'ACTIVE' ? new Date().toISOString() : null,
          }),
        });

        if (!upsertPaymentResponse.ok) {
          const errorBody = await safeParseJson(upsertPaymentResponse);
          throw new Error(errorBody?.message ?? 'No se pudo actualizar el estado de pago');
        }
      }

      resetForm();
      await loadUsers(token, page, searchName, monthKey);
      setToast({
        type: 'success',
        message: isEditing ? 'Socio actualizado correctamente' : 'Socio creado correctamente',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setFormError(message);
      setToast({ type: 'error', message: 'No se pudo guardar el socio' });
    } finally {
      setSavingUser(false);
    }
  };

  const onEditUser = (user: UserItem) => {
    if (!isAdmin) return;
    setEditingUserId(user.id);
    setFormError('');
    setUserFormErrors({});
    setUserForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      dni: user.dni ?? '',
      phone: user.phone ?? '',
      plan: user.plan ?? '',
      planExpiresAt: formatDateForInput(user.planExpiresAt),
      status: user.status === 'PAID' ? 'ACTIVE' : 'INACTIVE',
    });
  };

  const onStartRenewal = (user: UserItem) => {
    if (!isAdmin) return;
    setRenewalError('');
    setRenewalForm({
      userId: user.id,
      memberNumber: user.memberNumber,
      fullName: `${user.firstName} ${user.lastName}`,
      monthKey,
      plan: user.plan ?? '',
      paid: user.status === 'PAID' ? 'SI' : 'NO',
      amountDue: '0',
    });
  };

  const onRenewalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !isAdmin || !renewalForm) return;

    if (!renewalForm.plan.trim()) {
      setRenewalError('Selecciona un plan para renovar.');
      return;
    }

    setSavingRenewal(true);
    setRenewalError('');

    try {
      const amountDue = Number(renewalForm.amountDue || 0);
      const amountPaid = renewalForm.paid === 'SI' ? amountDue : 0;
      const periodRange = getMonthDateRange(renewalForm.monthKey);

      const updateUserResponse = await fetch(`${API_URL}/users/${renewalForm.userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: renewalForm.plan,
          status: 'ACTIVE',
          planExpiresAt: periodRange.endDate,
        }),
      });

      if (!updateUserResponse.ok) {
        const errorBody = await safeParseJson(updateUserResponse);
        throw new Error(errorBody?.message ?? 'No se pudo actualizar el plan del socio');
      }

      const createPeriodResponse = await fetch(`${API_URL}/billing/plan-periods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: renewalForm.userId,
          planName: renewalForm.plan,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          status: 'ACTIVE',
        }),
      });

      if (!createPeriodResponse.ok) {
        const errorBody = await safeParseJson(createPeriodResponse);
        throw new Error(errorBody?.message ?? 'No se pudo registrar el período del plan');
      }

      const upsertPaymentResponse = await fetch(`${API_URL}/billing/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: renewalForm.userId,
          monthKey: renewalForm.monthKey,
          amountDue,
          amountPaid,
          paidAt: renewalForm.paid === 'SI' ? new Date().toISOString() : null,
        }),
      });

      if (!upsertPaymentResponse.ok) {
        const errorBody = await safeParseJson(upsertPaymentResponse);
        throw new Error(errorBody?.message ?? 'No se pudo registrar el pago del mes');
      }

      await loadUsers(token, page, searchName, monthKey);
      setToast({ type: 'success', message: 'Mes renovado correctamente' });
      setRenewalForm(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setRenewalError(message);
    } finally {
      setSavingRenewal(false);
    }
  };

  const loadCheckinHistory = async (
    accessToken: string,
    month: number,
    year: number,
    nextPage: number,
  ) => {
    setLoadingHistory(true);
    setHistoryError('');

    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        page: String(nextPage),
        limit: String(historyPageSize),
      });

      const response = await fetch(`${API_URL}/checkins?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo cargar historial de asistencias');
      }

      const data = (await response.json()) as CheckinHistoryResponse;
      setHistoryItems(data.data);
      setHistoryPage(data.page);
      setHistoryTotalPages(data.totalPages || 1);
      setHistoryTotal(data.total);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setHistoryError(message);
      setHistoryItems([]);
      setHistoryPage(1);
      setHistoryTotalPages(1);
      setHistoryTotal(0);
    } finally {
      setLoadingHistory(false);
    }
  };

  const downloadAttendanceWorkbook = async (scope: 'month' | 'year') => {
    if (!token || !isAdmin) return;

    const isMonth = scope === 'month';
    if (isMonth) {
      setDownloadingAttendanceMonth(true);
    } else {
      setDownloadingAttendanceYear(true);
    }

    try {
      const params = new URLSearchParams({ year: String(historyYear) });
      if (isMonth) {
        params.set('month', String(historyMonth));
      }

      const response = await fetch(`${API_URL}/checkins/export/attendance?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo descargar la tabla de asistencias');
      }

      await downloadResponseBlob(response, isMonth ? 'asistencias_mes.xlsx' : 'asistencias_anio.xlsx');
      setToast({
        type: 'success',
        message: isMonth
          ? 'Tabla de asistencias mensual descargada correctamente'
          : 'Tabla de asistencias anual descargada correctamente',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setToast({ type: 'error', message });
    } finally {
      if (isMonth) {
        setDownloadingAttendanceMonth(false);
      } else {
        setDownloadingAttendanceYear(false);
      }
    }
  };

  const downloadMembersWorkbook = async () => {
    if (!token || !isAdmin) return;

    setDownloadingMembers(true);

    try {
      const exportResponse = await fetch(`${API_URL}/billing/monthly-status/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          monthKey,
          ...(searchName.trim() ? { name: searchName.trim() } : {}),
        }),
      });

      if (!exportResponse.ok) {
        const errorBody = await safeParseJson(exportResponse);
        throw new Error(errorBody?.message ?? 'No se pudo generar la tabla de alumnos');
      }

      const job = (await exportResponse.json()) as ExportJobResponse;
      if (!job.id) {
        throw new Error('No se pudo obtener el archivo de alumnos');
      }

      const detailResponse = await fetch(`${API_URL}/exports/${job.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!detailResponse.ok) {
        const errorBody = await safeParseJson(detailResponse);
        throw new Error(errorBody?.message ?? 'No se pudo obtener el enlace de descarga');
      }

      const detail = (await detailResponse.json()) as ExportJobDetailResponse;
      const downloadUrl = detail.downloadUrl;
      if (!downloadUrl) {
        throw new Error('No se recibió una URL de descarga válida');
      }

      const absoluteDownloadUrl = toAbsoluteDownloadUrl(downloadUrl);
      const fileResponse = await fetch(absoluteDownloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!fileResponse.ok) {
        throw new Error('No se pudo descargar el archivo de alumnos');
      }

      await downloadResponseBlob(fileResponse, `alumnos_totales_${monthKey}.xlsx`);
      setToast({ type: 'success', message: 'Tabla de alumnos totales descargada correctamente' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setToast({ type: 'error', message });
    } finally {
      setDownloadingMembers(false);
    }
  };

  const onDeleteUser = async (userId: string) => {
    if (!token || !isAdmin) return;
    const confirmed = window.confirm('¿Seguro que quieres eliminar este socio?');
    if (!confirmed) return;

    setDeletingUserId(userId);
    setUsersError('');

    try {
      const response = await fetch(`${API_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw new Error(errorBody?.message ?? 'No se pudo eliminar el socio');
      }

      if (editingUserId === userId) {
        resetForm();
      }

      await loadUsers(token, page, searchName, monthKey);
      setToast({ type: 'success', message: 'Socio eliminado correctamente' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setUsersError(message);
      setToast({ type: 'error', message: 'No se pudo eliminar el socio' });
    } finally {
      setDeletingUserId(null);
    }
  };

  const resetForm = () => {
    setEditingUserId(null);
    setFormError('');
    setUserFormErrors({});
    setUserForm(INITIAL_USER_FORM);
  };

  const resetAdminForm = () => {
    setEditingAdminId(null);
    setAdminsError('');
    setAdminForm({
      dni: '',
      firstName: '',
      lastName: '',
      password: '',
    });
  };

  const updateUserField = <K extends keyof UserFormValues>(field: K, value: UserFormValues[K]) => {
    setUserForm((previous) => ({ ...previous, [field]: value }));
    setUserFormErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const statusText = useMemo(() => {
    if (!isLoggedIn) return 'No autenticado';
    if (loadingUsers) return 'Cargando usuarios...';
    return `${total} usuarios encontrados`;
  }, [isLoggedIn, loadingUsers, total]);

  return (
    <main className="app">
      <section className="card">
        <h1>Panel de Gestión del Gimnasio</h1>
        <p className="hint">Controlá socios, asistencias, pagos y administradores desde un solo lugar.</p>

        {toast && <p className={`toast ${toast.type}`}>{toast.message}</p>}

        {!isLoggedIn ? (
          <form onSubmit={onAccessSubmit} className="form">
            <label>
              DNI
              <input
                type="text"
                value={accessDni}
                onChange={(event) => {
                  const nextDni = event.target.value;
                  const nextIsAdminAccess = isAdminDni(nextDni);
                  setAccessDni(nextDni);
                  setAuthError('');
                  if (!nextIsAdminAccess) {
                    setPassword('');
                  }
                }}
                required
              />
            </label>

            {isAdminAccess && (
              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </label>
            )}

            <button type="submit" disabled={loadingLogin}>
              {loadingLogin
                ? isAdminAccess
                  ? 'Ingresando...'
                  : 'Registrando...'
                : isAdminAccess
                  ? 'Iniciar sesión admin'
                  : 'Registrar ingreso'}
            </button>

            {isAdminAccess && authError && <p className="error">{authError}</p>}
          </form>
        ) : (
          <>
            <div className="toolbar">
              <p className="status">{statusText}</p>
              <div className="toolbarActions">
                <span className="roleBadge">Rol: {role ?? 'N/D'}</span>
                {isAdmin && (
                  <button
                    onClick={() => setAdminView((prev) => (prev === 'members' ? 'admins' : 'members'))}
                    className="secondary"
                  >
                    {adminView === 'members' ? 'Gestión admins' : 'Volver a socios'}
                  </button>
                )}
                <button onClick={logout} className="secondary">
                  Cerrar sesión
                </button>
              </div>
            </div>

            {isAdmin && adminView === 'admins' ? (
              <>
                <form onSubmit={onAdminFormSubmit} className="adminForm">
                  <h2>{editingAdminId ? 'Editar admin' : 'Nuevo admin'}</h2>
                  <div className="formGrid">
                    <label>
                      DNI
                      <input
                        type="text"
                        value={adminForm.dni}
                        onChange={(event) =>
                          setAdminForm((prev) => ({ ...prev, dni: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Nombre
                      <input
                        type="text"
                        value={adminForm.firstName}
                        onChange={(event) =>
                          setAdminForm((prev) => ({ ...prev, firstName: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Apellido
                      <input
                        type="text"
                        value={adminForm.lastName}
                        onChange={(event) =>
                          setAdminForm((prev) => ({ ...prev, lastName: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      {editingAdminId ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                      <input
                        type="password"
                        value={adminForm.password}
                        onChange={(event) =>
                          setAdminForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        minLength={6}
                        required={!editingAdminId}
                      />
                    </label>
                  </div>

                  <div className="formActions">
                    <button type="submit" disabled={savingAdmin}>
                      {savingAdmin
                        ? 'Guardando...'
                        : editingAdminId
                          ? 'Guardar cambios admin'
                          : 'Crear admin'}
                    </button>
                    {editingAdminId && (
                      <button type="button" className="secondary" onClick={resetAdminForm}>
                        Cancelar edición
                      </button>
                    )}
                  </div>
                </form>

                {adminsError && <p className="error">{adminsError}</p>}

                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>DNI</th>
                        <th>Nombre</th>
                        <th>Rol</th>
                        <th>Creado</th>
                        <th>Actualizado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.length === 0 && !loadingAdmins ? (
                        <tr>
                          <td colSpan={6} className="empty">
                            No hay admins
                          </td>
                        </tr>
                      ) : (
                        admins.map((admin) => (
                          <tr key={admin.id}>
                            <td data-label="DNI">{admin.dni}</td>
                            <td data-label="Nombre">{`${admin.firstName} ${admin.lastName}`}</td>
                            <td data-label="Rol">{admin.role}</td>
                            <td data-label="Creado">{formatDateForDisplay(admin.createdAt)}</td>
                            <td data-label="Actualizado">{formatDateForDisplay(admin.updatedAt)}</td>
                            <td data-label="Acciones" className="rowActions">
                              <button type="button" className="secondary" onClick={() => onEditAdmin(admin)}>
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteAdmin(admin.id)}
                                disabled={deletingAdminId === admin.id}
                              >
                                {deletingAdminId === admin.id ? 'Eliminando...' : 'Eliminar'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="pagination">
                  <button
                    onClick={() => {
                      if (!token || adminsPage <= 1) return;
                      void loadAdmins(token, adminsPage - 1);
                    }}
                    disabled={loadingAdmins || adminsPage <= 1}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {adminsPage} de {adminsTotalPages} ({adminsTotal} registros)
                  </span>
                  <button
                    onClick={() => {
                      if (!token || adminsPage >= adminsTotalPages) return;
                      void loadAdmins(token, adminsPage + 1);
                    }}
                    disabled={loadingAdmins || adminsPage >= adminsTotalPages}
                  >
                    Siguiente
                  </button>
                </div>
              </>
            ) : (
              <>

            {isAdmin && (
              <form onSubmit={onUserFormSubmit} className="adminForm">
                <h2>{editingUserId ? 'Editar socio' : 'Nuevo socio'}</h2>

                {editingUserId ? (
                  <p className="hint">El N° de socio se genera automáticamente y no se puede editar.</p>
                ) : (
                  <p className="hint">El N° de socio se asignará automáticamente al crear.</p>
                )}

                <div className="formGrid">
                  <label>
                    Nombre
                    <input
                      type="text"
                      value={userForm.firstName}
                      onChange={(event) => updateUserField('firstName', event.target.value)}
                      className={userFormErrors.firstName ? 'inputError' : ''}
                      required
                    />
                    {userFormErrors.firstName && (
                      <span className="fieldError">{userFormErrors.firstName}</span>
                    )}
                  </label>

                  <label>
                    Apellido
                    <input
                      type="text"
                      value={userForm.lastName}
                      onChange={(event) => updateUserField('lastName', event.target.value)}
                      className={userFormErrors.lastName ? 'inputError' : ''}
                      required
                    />
                    {userFormErrors.lastName && (
                      <span className="fieldError">{userFormErrors.lastName}</span>
                    )}
                  </label>

                  <label>
                    DNI
                    <input
                      type="text"
                      value={userForm.dni}
                      onChange={(event) => updateUserField('dni', event.target.value)}
                    />
                  </label>

                  <label>
                    Teléfono
                    <input
                      type="text"
                      value={userForm.phone}
                      onChange={(event) => updateUserField('phone', event.target.value)}
                    />
                  </label>

                  <label>
                    Plan
                    <select
                      value={userForm.plan}
                      onChange={(event) => {
                        const selectedPlan = event.target.value;
                        updateUserField('plan', selectedPlan);
                        updateUserField('planExpiresAt', selectedPlan ? getDatePlusDays(31) : '');
                      }}
                    >
                      <option value="">Seleccionar</option>
                      {PLAN_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Vence plan
                    <span>{getAutoExpirationText(userForm.plan)}</span>
                    <span className="hint">Cálculo automático: 31 días desde hoy.</span>
                  </label>

                  <label>
                    Estado de pago
                    <select
                      value={userForm.status}
                      onChange={(event) =>
                        updateUserField('status', event.target.value as 'ACTIVE' | 'INACTIVE')
                      }
                    >
                      <option value="ACTIVE">PAGO</option>
                      <option value="INACTIVE">NO PAGO</option>
                    </select>
                  </label>
                </div>

                <div className="formActions">
                  <button type="submit" disabled={savingUser}>
                    {savingUser ? 'Guardando...' : editingUserId ? 'Guardar cambios' : 'Crear socio'}
                  </button>
                  {editingUserId && (
                    <button type="button" className="secondary" onClick={resetForm}>
                      Cancelar edición
                    </button>
                  )}
                </div>

                {formError && <p className="error">{formError}</p>}
              </form>
            )}

            {!isAdmin && (
              <p className="hint">Tu usuario no es ADMIN, por eso solo tienes acceso de lectura.</p>
            )}

            <form onSubmit={onSearchSubmit} className="searchRow">
              <input
                type="month"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Buscar por nombre o apellido"
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
              />
              <button type="submit" disabled={loadingUsers}>
                Buscar
              </button>
            </form>

            {isAdmin && (
              <div className="formActions exportActions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void downloadAttendanceWorkbook('month')}
                  disabled={downloadingAttendanceMonth || downloadingAttendanceYear || loadingHistory}
                >
                  {downloadingAttendanceMonth ? 'Descargando asistencias (mes)...' : 'Descargar asistencias (mes)'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void downloadAttendanceWorkbook('year')}
                  disabled={downloadingAttendanceMonth || downloadingAttendanceYear || loadingHistory}
                >
                  {downloadingAttendanceYear ? 'Descargando asistencias (año)...' : 'Descargar asistencias (año)'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void downloadMembersWorkbook()}
                  disabled={downloadingMembers || loadingUsers}
                >
                  {downloadingMembers ? 'Descargando alumnos...' : 'Descargar alumnos totales'}
                </button>
              </div>
            )}

            {isAdmin && renewalForm && (
              <form onSubmit={onRenewalSubmit} className="adminForm">
                <h2>Renovar mes</h2>
                <p className="hint">
                  Socio: {renewalForm.memberNumber} - {renewalForm.fullName}
                </p>

                <div className="formGrid">
                  <label>
                    Mes
                    <input
                      type="month"
                      value={renewalForm.monthKey}
                      onChange={(event) =>
                        setRenewalForm((prev) =>
                          prev ? { ...prev, monthKey: event.target.value } : prev,
                        )
                      }
                      required
                    />
                  </label>

                  <label>
                    Plan
                    <select
                      value={renewalForm.plan}
                      onChange={(event) =>
                        setRenewalForm((prev) =>
                          prev ? { ...prev, plan: event.target.value } : prev,
                        )
                      }
                      required
                    >
                      <option value="">Seleccionar</option>
                      {PLAN_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    ¿Pagó?
                    <select
                      value={renewalForm.paid}
                      onChange={(event) =>
                        setRenewalForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                paid: event.target.value as 'SI' | 'NO',
                              }
                            : prev,
                        )
                      }
                    >
                      <option value="SI">Sí</option>
                      <option value="NO">No</option>
                    </select>
                  </label>

                  <label>
                    Importe
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={renewalForm.amountDue}
                      onChange={(event) =>
                        setRenewalForm((prev) =>
                          prev ? { ...prev, amountDue: event.target.value } : prev,
                        )
                      }
                    />
                  </label>
                </div>

                <div className="formActions">
                  <button type="submit" disabled={savingRenewal}>
                    {savingRenewal ? 'Guardando...' : 'Guardar renovación'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setRenewalForm(null)}
                  >
                    Cancelar
                  </button>
                </div>

                {renewalError && <p className="error">{renewalError}</p>}
              </form>
            )}

            {usersError && <p className="error">{usersError}</p>}

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>N° socio</th>
                    <th>Nombre</th>
                    <th>DNI</th>
                    <th>Pago</th>
                    <th>Plan</th>
                    <th>Último pago</th>
                    <th>Mes pagado</th>
                    <th>Vence</th>
                    <th>Días restantes</th>
                    {isAdmin && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && !loadingUsers ? (
                    <tr>
                      <td colSpan={isAdmin ? 10 : 9} className="empty">
                        No hay resultados
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const isExpired =
                        user.planExpiresAt ? calculateDaysRemaining(user.planExpiresAt) < 0 : false;

                      return (
                      <tr key={user.id}>
                        <td data-label="N° socio">{user.memberNumber}</td>
                        <td data-label="Nombre">{`${user.firstName} ${user.lastName}`}</td>
                        <td data-label="DNI">{user.dni ?? '-'}</td>
                        <td data-label="Pago">
                          <span className={isPaidStatus(user.status) ? 'statusPill success' : 'statusPill danger'}>
                            {toPaymentLabel(user.status)}
                          </span>
                        </td>
                        <td data-label="Plan">{(user.plan ?? '-').replace('_', ' ')}</td>
                        <td data-label="Último pago">{formatDateForDisplay(user.paidAt)}</td>
                        <td data-label="Mes pagado">{user.monthKey ?? monthKey}</td>
                        <td data-label="Vence">{formatDateForDisplay(user.planExpiresAt)}</td>
                        <td data-label="Días restantes">
                          <span className={getDaysBadgeClass(user.planExpiresAt)}>
                            {formatDaysRemaining(user.planExpiresAt)}
                          </span>
                        </td>
                        {isAdmin && (
                          <td data-label="Acciones" className="rowActions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => onEditUser(user)}
                            >
                              Editar
                            </button>
                            {isExpired && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => onStartRenewal(user)}
                              >
                                Renovar mes
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteUser(user.id)}
                              disabled={deletingUserId === user.id}
                            >
                              {deletingUserId === user.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </td>
                        )}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <h2>Tabla asistencias</h2>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>N° socio</th>
                    <th>Nombre</th>
                    <th>DNI</th>
                    <th>Plan</th>
                    <th>Último pago</th>
                    <th>Límite semanal</th>
                    <th>Sem1</th>
                    <th>Sem2</th>
                    <th>Sem3</th>
                    <th>Sem4</th>
                    <th>Sem5</th>
                    <th>Total</th>
                    <th>Control</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && !loadingUsers ? (
                    <tr>
                      <td colSpan={13} className="empty">
                        No hay resultados
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const weeklyLimit = getWeeklyLimitByPlan(user.plan);
                      const weekValues = [
                        user.week1Checkins ?? 0,
                        user.week2Checkins ?? 0,
                        user.week3Checkins ?? 0,
                        user.week4Checkins ?? 0,
                        user.week5Checkins ?? 0,
                      ];
                      const exceedsLimit =
                        weeklyLimit !== null && weekValues.some((weekCount) => weekCount > weeklyLimit);

                      return (
                        <tr key={`attendance-${user.id}`}>
                          <td data-label="N° socio">{user.memberNumber}</td>
                          <td data-label="Nombre">{`${user.firstName} ${user.lastName}`}</td>
                          <td data-label="DNI">{user.dni ?? '-'}</td>
                          <td data-label="Plan">{(user.plan ?? '-').replace('_', ' ')}</td>
                          <td data-label="Último pago">{formatDateForDisplay(user.paidAt)}</td>
                          <td data-label="Límite semanal">{weeklyLimit === null ? 'Sin límite' : weeklyLimit}</td>
                          <td data-label="Sem1">{weekValues[0]}</td>
                          <td data-label="Sem2">{weekValues[1]}</td>
                          <td data-label="Sem3">{weekValues[2]}</td>
                          <td data-label="Sem4">{weekValues[3]}</td>
                          <td data-label="Sem5">{weekValues[4]}</td>
                          <td data-label="Total">{user.totalCheckins ?? 0}</td>
                          <td data-label="Control">
                            <span className={exceedsLimit ? 'statusPill danger' : 'statusPill success'}>
                              {weeklyLimit === null ? 'Sin límite' : exceedsLimit ? 'Excede' : 'OK'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <h2>Historial de asistencias por mes y año</h2>
            <form
              className="toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                if (!token || !isAdmin) return;
                void loadCheckinHistory(token, historyMonth, historyYear, 1);
              }}
            >
              <label>
                Mes
                <select
                  value={historyMonth}
                  onChange={(event) => setHistoryMonth(Number(event.target.value))}
                >
                  {Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    return (
                      <option key={month} value={month}>
                        {String(month).padStart(2, '0')}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                Año
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={historyYear}
                  onChange={(event) => setHistoryYear(Number(event.target.value))}
                />
              </label>
              <button type="submit" disabled={loadingHistory}>
                {loadingHistory ? 'Cargando...' : 'Ver historial'}
              </button>
            </form>

            {historyError && <p className="error">{historyError}</p>}

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>N° socio</th>
                    <th>Nombre</th>
                    <th>DNI</th>
                    <th>Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.length === 0 && !loadingHistory ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No hay asistencias para {String(historyMonth).padStart(2, '0')}/{historyYear}
                      </td>
                    </tr>
                  ) : (
                    historyItems.map((item) => (
                      <tr key={`history-${item.id}`}>
                        <td data-label="Fecha">{formatDateTimeForDisplay(item.checkinAt)}</td>
                        <td data-label="N° socio">{item.user?.memberNumber ?? '-'}</td>
                        <td data-label="Nombre">{`${item.user?.firstName ?? ''} ${item.user?.lastName ?? ''}`.trim() || '-'}</td>
                        <td data-label="DNI">{item.user?.dni ?? '-'}</td>
                        <td data-label="Plan">{(item.user?.plan ?? '-').replace('_', ' ')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                onClick={() => {
                  if (!token || !isAdmin || historyPage <= 1) return;
                  void loadCheckinHistory(token, historyMonth, historyYear, historyPage - 1);
                }}
                disabled={loadingHistory || historyPage <= 1}
              >
                Anterior
              </button>
              <span>
                Página {historyPage} de {historyTotalPages} ({historyTotal} registros)
              </span>
              <button
                onClick={() => {
                  if (!token || !isAdmin || historyPage >= historyTotalPages) return;
                  void loadCheckinHistory(token, historyMonth, historyYear, historyPage + 1);
                }}
                disabled={loadingHistory || historyPage >= historyTotalPages}
              >
                Siguiente
              </button>
            </div>

            <div className="pagination">
              <button
                onClick={() => loadUsers(token, page - 1, searchName, monthKey)}
                disabled={loadingUsers || page <= 1}
              >
                Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => loadUsers(token, page + 1, searchName, monthKey)}
                disabled={loadingUsers || page >= totalPages}
              >
                Siguiente
              </button>
            </div>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function parseAdminDnis(rawValue: string): Set<string> {
  return new Set(
    rawValue
      .split(',')
      .map((dni) => normalizeDni(dni))
      .filter(Boolean),
  );
}

function isAdminDni(dni: string): boolean {
  return ADMIN_DNIS.has(normalizeDni(dni));
}

function normalizeDni(value: string): string {
  return value.replace(/\D/g, '');
}

function buildUserPayload(values: UserFormValues) {
  const payload: Record<string, string> = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    status: values.status,
  };

  if (values.plan.trim()) {
    payload.planExpiresAt = getDatePlusDays(31);
  }

  const optionalFields: Array<keyof Omit<UserFormValues, 'firstName' | 'lastName' | 'status'>> = [
    'dni',
    'phone',
    'plan',
    'planExpiresAt',
  ];

  for (const field of optionalFields) {
    const value = values[field].trim();
    if (value) {
      payload[field] = value;
    }
  }

  return payload;
}

function validateUserForm(values: UserFormValues): UserFormErrors {
  const errors: UserFormErrors = {};

  if (!values.firstName.trim()) {
    errors.firstName = 'El nombre es obligatorio';
  }

  if (!values.lastName.trim()) {
    errors.lastName = 'El apellido es obligatorio';
  }

  return errors;
}

function decodeJwtPayload(accessToken: string): { role?: string } | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    return JSON.parse(decoded) as { role?: string };
  } catch {
    return null;
  }
}

function formatDateForInput(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function formatDateForDisplay(value?: string | null): string {
  if (!value) return '-';
  return value.slice(0, 10);
}

function formatDateTimeForDisplay(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function getDatePlusDays(days: number): string {
  const nextDate = new Date();
  nextDate.setHours(0, 0, 0, 0);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function getMonthDateRange(monthKey: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!year || !month || month < 1 || month > 12) {
    const fallback = getCurrentMonthKey();
    return getMonthDateRange(fallback);
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getAutoExpirationText(plan?: string | null): string {
  if (!plan) {
    return '-';
  }

  return `${getDatePlusDays(31)} (31 días)`;
}

function isPaidStatus(status?: string | null): boolean {
  return status === 'PAID';
}

function toPaymentLabel(status?: string | null): string {
  if (status === 'PAID') {
    return 'PAGO';
  }
  return 'NO PAGO';
}

function getWeeklyLimitByPlan(plan?: string | null): number | null {
  switch ((plan ?? '').trim().toUpperCase()) {
    case '1_DIA':
    case '1 DIA':
      return 1;
    case '2_DIAS':
    case '2 DIAS':
      return 2;
    case '3_DIAS':
    case '3 DIAS':
      return 3;
    case 'PASE_LIBRE':
    case 'PASE LIBRE':
    case 'LIBRE':
      return null;
    default:
      return null;
  }
}

function formatDaysRemaining(expirationDate?: string | null): string {
  if (!expirationDate) return '-';
  const days = calculateDaysRemaining(expirationDate);
  if (days > 0) return `${days} días`;
  if (days === 0) return 'Vence hoy';
  return `Vencido (${Math.abs(days)}d)`;
}

function getDaysBadgeClass(expirationDate?: string | null): string {
  if (!expirationDate) return 'daysBadge';
  const days = calculateDaysRemaining(expirationDate);
  if (days < 0) return 'daysBadge danger';
  if (days <= 5) return 'daysBadge warning';
  return 'daysBadge success';
}

function calculateDaysRemaining(expirationDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(expirationDate.slice(0, 10));
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function safeParseJson(response: Response): Promise<{ message?: string } | null> {
  try {
    return (await response.json()) as { message?: string };
  } catch {
    return null;
  }
}

function getApiOrigin(apiUrl: string): string {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return '';
  }
}

function toAbsoluteDownloadUrl(downloadUrl: string): string {
  if (/^https?:\/\//i.test(downloadUrl)) {
    return downloadUrl;
  }

  const normalizedPath = downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}`;
  return `${API_ORIGIN}${normalizedPath}`;
}

function getFileNameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] ?? null;
}

async function downloadResponseBlob(response: Response, fallbackFileName: string): Promise<void> {
  const blob = await response.blob();
  const fileName =
    getFileNameFromContentDisposition(response.headers.get('content-disposition')) ?? fallbackFileName;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export default App;
