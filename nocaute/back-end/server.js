// Esta é a ponte entre o site e o Supabase; as chaves ficam aqui, longe da vitrine.
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseAdminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/+$/, "");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo back-end/.env.");
}

const app = express();
const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../front-end");
// Cliente de login usa a chave pública; o de admin só aparece se a chave secreta existir.
const createAuthClient = () => createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const createAdminClient = () => supabaseAdminKey
  ? createClient(supabaseUrl, supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
const supabase = createAuthClient();
const createUserClient = (accessToken) => createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${accessToken}` } }
});

// Busca o cadastro que diz quem é a pessoa e se ela pode entrar.
async function getAccountProfile(client, userId) {
  const { data, error } = await client
    .from("profiles")
    .select("role, status, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Falha ao consultar o perfil no Supabase:", error.message);
    throw new Error("Não foi possível consultar o perfil da conta.");
  }
  return data;
}

// Não deixa papel estranho virar passe livre. Aqui não tem carteirinha de faz de conta.
function publicRole(role) {
  return ["aluno", "instrutor", "admin"].includes(role) ? role : "aluno";
}

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDirectory));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Confere a senha no Supabase e compara o perfil escolhido com o perfil de verdade.
app.post("/api/auth/login", async (req, res, next) => {
  const { email, password, expectedRole } = req.body || {};
  if (typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password ||
      !["aluno", "instrutor", "admin"].includes(expectedRole)) {
    return res.status(400).json({ error: "Informe e-mail, senha e perfil." });
  }

  try {
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error?.code === "email_not_confirmed") {
      return res.status(403).json({
        code: "email_not_confirmed",
        error: "Confirme seu e-mail antes de entrar. Você pode solicitar um novo link."
      });
    }

    if (error || !data.session || !data.user) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    const profile = await getAccountProfile(authClient, data.user.id);
    if (!profile || profile.status !== "ativo") {
      await authClient.auth.signOut();
      return res.status(403).json({ error: "Esta conta está inativa ou não possui perfil configurado." });
    }

    const role = publicRole(profile.role);
    if (role !== expectedRole) {
      await authClient.auth.signOut();
      return res.status(403).json({ error: "O perfil selecionado não corresponde a esta conta." });
    }

    return res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role,
        fullName: profile.full_name || ""
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Cadastro aberto é só para aluno; instrutor não se promove sozinho, porra.
app.post("/api/auth/register", async (req, res, next) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Informe nome, e-mail válido e senha com ao menos 6 caracteres." });
  }

  try {
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${frontendUrl}/email-confirmed.html`
      }
    });

    if (error) {
      return res.status(error.status === 429 ? 429 : 400)
        .json({ error: "Não foi possível criar a conta. Verifique o e-mail e tente novamente." });
    }

    if (!data.session || !data.user) {
      return res.status(202).json({
        confirmationRequired: true,
        message: "Cadastro iniciado. Confira seu e-mail para confirmar a conta."
      });
    }

    const profile = await getAccountProfile(authClient, data.user.id);
    if (!profile || profile.status !== "ativo") {
      await authClient.auth.signOut();
      return res.status(503).json({ error: "A conta foi criada, mas seu perfil ainda não está disponível. Tente entrar novamente." });
    }

    return res.status(201).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: publicRole(profile.role),
        fullName: profile.full_name || name.trim()
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Reenvia a confirmação sem entregar se um e-mail existe ou não.
app.post("/api/auth/resend-confirmation", async (req, res, next) => {
  const { email } = req.body || {};
  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Informe seu e-mail." });
  }

  try {
    const { error } = await createAuthClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${frontendUrl}/email-confirmed.html`
      }
    });

    if (error) {
      if (error.status === 429) {
        return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos antes de pedir outro e-mail." });
      }
      console.error("Falha ao reenviar confirmação de cadastro:", error.message);
    }

    return res.json({
      message: "Se houver uma conta pendente para esse e-mail, enviaremos um novo link de confirmação."
    });
  } catch (error) {
    return next(error);
  }
});

// Só convite válido pode trocar a senha por aqui; o segredo admin não sai do servidor.
app.put("/api/auth/password", requireAuth, async (req, res, next) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres." });
  }

  try {
    const adminClient = createAdminClient();
    if (!adminClient) {
      return res.status(503).json({ error: "A configuração segura do Supabase Admin está ausente no backend." });
    }

    const { error } = await adminClient.auth.admin.updateUserById(req.authUser.id, { password });
    if (error) {
      console.error("Falha ao definir senha de usuário convidado:", error.message);
      return res.status(400).json({ error: "Não foi possível definir a senha. Solicite um novo convite." });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

// Troca o passe vencido por um novo, sem pedir a senha de novo.
app.post("/api/auth/refresh", async (req, res, next) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== "string" || !refreshToken) {
    return res.status(400).json({ error: "Token de renovação não informado." });
  }

  try {
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session || !data.user) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    const profile = await getAccountProfile(authClient, data.user.id);
    if (!profile || profile.status !== "ativo") {
      await authClient.auth.signOut();
      return res.status(403).json({ error: "Esta conta está inativa ou não possui perfil configurado." });
    }

    return res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: publicRole(profile.role),
        fullName: profile.full_name || ""
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Encerra a sessão no Supabase, além de limpar o que ficou no navegador.
app.post("/api/auth/logout", async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const { refreshToken } = req.body || {};
  if (!accessToken || typeof refreshToken !== "string" || !refreshToken) {
    return res.status(400).json({ error: "Sessão incompleta." });
  }

  try {
    const authClient = createAuthClient();
    const { error: sessionError } = await authClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (sessionError) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }

    const { error } = await authClient.auth.signOut();
    if (error) return next(error);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

// Confere o token com o Supabase antes de deixar qualquer rota protegida continuar.
async function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: "Token de acesso não informado." });
  }

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error) {
    if (error.status === 401 || error.status === 403) {
      return res.status(401).json({ error: "Token inválido ou expirado." });
    }
    console.error("Falha ao validar token com o Supabase:", error.message);
    return res.status(503).json({ error: "Não foi possível validar a sessão agora." });
  }

  if (!data.user) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }

  req.authUser = data.user;
  req.userClient = createUserClient(match[1]);
  return next();
}

// Devolve só os dados básicos da conta que está usando o site.
app.get("/api/me", requireAuth, async (req, res, next) => {
  try {
    const profile = await getAccountProfile(req.userClient, req.authUser.id);
    if (!profile || profile.status !== "ativo") {
      return res.status(403).json({ error: "Esta conta está inativa ou não possui perfil configurado." });
    }

    return res.json({
      id: req.authUser.id,
      email: req.authUser.email,
      role: publicRole(profile.role),
      fullName: profile.full_name || ""
    });
  } catch (error) {
    return next(error);
  }
});

// A porta admin só abre para perfil ativo de admin; insistir não vira autorização.
async function requireAdmin(req, res, next) {
  const { data: profile, error } = await req.userClient
    .from("profiles")
    .select("role, status")
    .eq("id", req.authUser.id)
    .maybeSingle();

  if (error) {
    console.error("Falha ao verificar perfil administrativo:", error.message);
    return res.status(503).json({ error: "Não foi possível validar as permissões administrativas." });
  }
  if (!profile || profile.role !== "admin" || profile.status !== "ativo") {
    return res.status(403).json({ error: "Acesso restrito a administradores ativos." });
  }
  return next();
}

async function requireStudent(req, res, next) {
  const { data: profile, error } = await req.userClient
    .from("profiles")
    .select("role, status")
    .eq("id", req.authUser.id)
    .maybeSingle();

  if (error) {
    console.error("Falha ao verificar perfil de aluno:", error.message);
    return res.status(503).json({ error: "Não foi possível validar o perfil da conta." });
  }
  if (!profile || profile.role !== "aluno" || profile.status !== "ativo") {
    return res.status(403).json({ error: "Esta função está disponível apenas para alunos ativos." });
  }
  return next();
}

async function requireInstructor(req, res, next) {
  const { data: profile, error } = await req.userClient
    .from("profiles")
    .select("role, status")
    .eq("id", req.authUser.id)
    .maybeSingle();

  if (error) {
    console.error("Falha ao verificar perfil de instrutor:", error.message);
    return res.status(503).json({ error: "Não foi possível validar o perfil da conta." });
  }
  if (!profile || profile.role !== "instrutor" || profile.status !== "ativo") {
    return res.status(403).json({ error: "Esta função está disponível apenas para instrutores ativos." });
  }
  return next();
}

app.get("/api/instructor/overview", requireAuth, requireInstructor, async (req, res) => {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "A configuração segura do Supabase Admin está ausente no backend." });
  }

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 30);
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 90);

  const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).map(part => [part.type, part.value]));
  const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const [{ data: sessions, error: sessionsError }, { data: schedules, error: schedulesError }] = await Promise.all([
    adminClient.from("class_sessions")
      .select("id, starts_at, ends_at, capacity, location, status, class:classes(id, name, level, duration_minutes, modality:modalities(name))")
      .eq("instructor_id", req.authUser.id)
      .gte("starts_at", periodStart.toISOString())
      .lte("starts_at", periodEnd.toISOString())
      .order("starts_at", { ascending: true })
      .limit(500),
    adminClient.from("class_schedules")
      .select("id, weekday, starts_at, effective_from, effective_until, class:classes(id, name, level, duration_minutes, capacity, location, modality:modalities(name))")
      .eq("instructor_id", req.authUser.id)
      .eq("active", true)
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .order("weekday", { ascending: true })
      .order("starts_at", { ascending: true })
  ]);
  if (sessionsError || schedulesError) {
    console.error("Falha ao carregar agenda do instrutor:", sessionsError?.message || schedulesError?.message);
    return res.status(503).json({ error: "Não foi possível carregar as aulas do instrutor." });
  }

  const sessionIds = sessions.map(session => session.id);
  if (!sessionIds.length) {
    return res.json({
      sessions: [],
      schedules,
      students: [],
      reports: { attendanceByWeekday: [0, 0, 0, 0, 0, 0, 0], occupancyByClass: [], studentsByModality: [], attendanceRate: 0, occupancyRate: 0, newStudents: 0 }
    });
  }

  const [{ data: reservations, error: reservationsError }, { data: attendance, error: attendanceError }] = await Promise.all([
    adminClient.from("reservations")
      .select("id, session_id, student_id, reserved_at")
      .in("session_id", sessionIds)
      .eq("status", "reservada"),
    adminClient.from("attendance")
      .select("id, session_id, student_id, status, marked_at")
      .in("session_id", sessionIds)
  ]);
  if (reservationsError || attendanceError) {
    console.error("Falha ao carregar alunos e presenças do instrutor:", reservationsError?.message || attendanceError?.message);
    return res.status(503).json({ error: "Não foi possível carregar alunos e presenças." });
  }

  const studentIds = [...new Set([
    ...reservations.map(reservation => reservation.student_id),
    ...attendance.map(record => record.student_id)
  ])];
  const [{ data: students, error: studentsError }, { data: memberships, error: membershipsError }] = studentIds.length
    ? await Promise.all([
      adminClient.from("profiles")
        .select("id, full_name, status, created_at")
        .in("id", studentIds)
        .eq("role", "aluno"),
      adminClient.from("memberships")
        .select("student_id, status, plan:membership_plans(name)")
        .in("student_id", studentIds)
        .eq("status", "ativa")
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (studentsError || membershipsError) {
    console.error("Falha ao carregar perfis ou planos dos alunos:", studentsError?.message || membershipsError?.message);
    return res.status(503).json({ error: "Não foi possível carregar os dados dos alunos." });
  }

  const studentById = new Map(students.map(student => [student.id, student]));
  const membershipByStudent = new Map(memberships.map(membership => [
    membership.student_id,
    Array.isArray(membership.plan) ? membership.plan[0]?.name : membership.plan?.name
  ]));
  const attendanceBySessionStudent = new Map(attendance.map(record => [
    `${record.session_id}:${record.student_id}`,
    record
  ]));
  const reservationsBySession = new Map();
  reservations.forEach(reservation => {
    const roster = reservationsBySession.get(reservation.session_id) || [];
    const student = studentById.get(reservation.student_id);
    if (student) roster.push({
      reservationId: reservation.id,
      studentId: student.id,
      fullName: student.full_name,
      status: student.status,
      plan: membershipByStudent.get(student.id) || null,
      attendance: attendanceBySessionStudent.get(`${reservation.session_id}:${student.id}`)?.status || null
    });
    reservationsBySession.set(reservation.session_id, roster);
  });

  const sessionsWithRoster = sessions.map(session => ({
    ...session,
    roster: reservationsBySession.get(session.id) || []
  }));
  const uniqueStudents = new Map();
  sessionsWithRoster.forEach(session => session.roster.forEach(student => uniqueStudents.set(student.studentId, student)));

  const pastSessions = sessionsWithRoster.filter(session => new Date(session.starts_at) <= now && session.status !== "cancelada");
  const pastAttendance = attendance.filter(record => record.status === "presente" || record.status === "falta");
  const attendanceByWeekday = [0, 0, 0, 0, 0, 0, 0];
  const pastSessionIds = new Set(pastSessions.map(session => session.id));
  const countedAttendance = pastAttendance.filter(record =>
    pastSessionIds.has(record.session_id) && ["presente", "falta"].includes(record.status)
  );
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short"
  });
  countedAttendance.forEach(record => {
    if (record.status === "presente") {
      const session = sessions.find(item => item.id === record.session_id);
      if (session) {
        const weekday = weekdayFormatter.format(new Date(session.starts_at));
        const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
        if (weekdayIndex !== -1) attendanceByWeekday[weekdayIndex] += 1;
      }
    }
  });

  const occupancyByClassMap = new Map();
  const studentsByModalityMap = new Map();
  sessionsWithRoster.filter(session => session.status !== "cancelada").forEach(session => {
    const className = session.class?.name || "Aula";
    const occupancy = occupancyByClassMap.get(className) || { occupied: 0, capacity: 0 };
    occupancy.occupied += session.roster.length;
    occupancy.capacity += session.capacity;
    occupancyByClassMap.set(className, occupancy);

    const modality = session.class?.modality?.name || "Sem modalidade";
    const studentSet = studentsByModalityMap.get(modality) || new Set();
    session.roster.forEach(student => studentSet.add(student.studentId));
    studentsByModalityMap.set(modality, studentSet);
  });
  const uniqueStudentRows = [...studentById.values()];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return res.json({
    sessions: sessionsWithRoster,
    schedules,
    students: [...uniqueStudents.values()],
    reports: {
      attendanceByWeekday,
      occupancyByClass: [...occupancyByClassMap].map(([name, counts]) => ({
        name,
        percentage: counts.capacity ? Math.round((counts.occupied / counts.capacity) * 100) : 0
      })),
      studentsByModality: [...studentsByModalityMap].map(([name, studentSet]) => ({
        name,
        count: studentSet.size
      })),
      attendanceRate: countedAttendance.length
        ? Math.round((countedAttendance.filter(record => record.status === "presente").length / countedAttendance.length) * 100)
        : 0,
      occupancyRate: sessionsWithRoster.length
        ? Math.round((sessionsWithRoster.reduce((total, session) => total + session.roster.length / session.capacity, 0) / sessionsWithRoster.length) * 100)
        : 0,
      newStudents: uniqueStudentRows.filter(student => new Date(student.created_at) >= monthStart).length
    }
  });
});

app.post("/api/instructor/attendance", requireAuth, requireInstructor, async (req, res) => {
  const { sessionId, records } = req.body || {};
  if (typeof sessionId !== "string" || !Array.isArray(records) || records.length === 0 ||
      records.length > 200 || records.some(record =>
        !record || typeof record.studentId !== "string" ||
        !["presente", "falta", "justificada"].includes(record.status)
      )) {
    return res.status(400).json({ error: "Informe a aula e uma chamada válida." });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "A configuração segura do Supabase Admin está ausente no backend." });
  }
  const { data: session, error: sessionError } = await adminClient.from("class_sessions")
    .select("id, starts_at, status")
    .eq("id", sessionId)
    .eq("instructor_id", req.authUser.id)
    .maybeSingle();
  if (sessionError || !session) {
    if (sessionError) console.error("Falha ao verificar aula da chamada:", sessionError.message);
    return res.status(sessionError ? 503 : 404).json({ error: "Aula não encontrada para este instrutor." });
  }
  if (session.status === "cancelada") {
    return res.status(409).json({ error: "Não é possível fazer chamada de uma aula cancelada." });
  }
  if (new Date(session.starts_at) > new Date()) {
    return res.status(409).json({ error: "A chamada só pode ser salva depois do início da aula." });
  }

  const studentIds = [...new Set(records.map(record => record.studentId))];
  if (studentIds.length !== records.length) {
    return res.status(400).json({ error: "A chamada contém alunos repetidos." });
  }
  const { data: roster, error: rosterError } = await adminClient.from("reservations")
    .select("student_id")
    .eq("session_id", sessionId)
    .eq("status", "reservada")
    .in("student_id", studentIds);
  if (rosterError) {
    console.error("Falha ao validar alunos da chamada:", rosterError.message);
    return res.status(503).json({ error: "Não foi possível validar a lista de alunos." });
  }
  if (roster.length !== studentIds.length) {
    return res.status(403).json({ error: "A chamada pode incluir apenas alunos reservados nesta aula." });
  }

  const rows = records.map(record => ({
    session_id: sessionId,
    student_id: record.studentId,
    marked_by: req.authUser.id,
    status: record.status,
    marked_at: new Date().toISOString()
  }));
  const { error } = await adminClient.from("attendance")
    .upsert(rows, { onConflict: "session_id,student_id" });
  if (error) {
    console.error("Falha ao salvar chamada:", error.message);
    return res.status(503).json({ error: "Não foi possível salvar a chamada." });
  }
  return res.json({ message: "Chamada salva." });
});

// Mostra aulas futuras e a quantidade de vagas já ocupadas, sem expor dados de outros alunos.
app.get("/api/student/sessions", requireAuth, requireStudent, async (req, res, next) => {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "A configuração segura do Supabase Admin está ausente no backend." });
  }

  try {
    const now = new Date().toISOString();
    const [{ data: sessions, error: sessionsError }, { data: reservations, error: reservationsError }] = await Promise.all([
      adminClient.from("class_sessions")
        .select("id, starts_at, ends_at, capacity, location, status, class:classes(id, name, level, duration_minutes, modality:modalities(name)), instructor:profiles!class_sessions_instructor_id_fkey(id, full_name)")
        .eq("status", "agendada")
        .gt("starts_at", now)
        .order("starts_at", { ascending: true })
        .limit(200),
      adminClient.from("reservations")
        .select("id, session_id, reserved_at")
        .eq("student_id", req.authUser.id)
        .eq("status", "reservada")
    ]);

    if (sessionsError || reservationsError) {
      console.error("Falha ao carregar aulas do aluno:", sessionsError?.message || reservationsError?.message);
      return res.status(503).json({ error: "Não foi possível carregar as aulas disponíveis." });
    }

    const sessionIds = sessions.map(session => session.id);
    const { data: activeReservations, error: countError } = sessionIds.length
      ? await adminClient.from("reservations")
        .select("session_id")
        .in("session_id", sessionIds)
        .eq("status", "reservada")
      : { data: [], error: null };
    if (countError) {
      console.error("Falha ao contar vagas das aulas:", countError.message);
      return res.status(503).json({ error: "Não foi possível carregar a disponibilidade das aulas." });
    }

    const reservationCounts = new Map();
    activeReservations.forEach(reservation => {
      reservationCounts.set(reservation.session_id, (reservationCounts.get(reservation.session_id) || 0) + 1);
    });

    return res.json({
      sessions: sessions.map(session => ({
        ...session,
        reservedCount: reservationCounts.get(session.id) || 0
      })),
      reservations
    });
  } catch (error) {
    return next(error);
  }
});

// A reserva usa a conta autenticada; a base confere vaga e impede duplicidade.
app.post("/api/student/reservations", requireAuth, requireStudent, async (req, res, next) => {
  const { sessionId } = req.body || {};
  if (typeof sessionId !== "string" || !sessionId) {
    return res.status(400).json({ error: "Selecione uma aula válida." });
  }

  const { data, error } = await req.userClient
    .from("reservations")
    .insert({ session_id: sessionId, student_id: req.authUser.id })
    .select("id, session_id, reserved_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Você já reservou esta aula." });
    }
    if (error.code === "23514") {
      return res.status(409).json({ error: error.message });
    }
    console.error("Falha ao reservar aula:", error.message);
    return res.status(503).json({ error: "Não foi possível reservar a aula." });
  }
  return res.status(201).json({ reservation: data });
});

// Só o dono da reserva pode cancelá-la; a vaga volta a ficar disponível.
app.delete("/api/student/reservations/:reservationId", requireAuth, requireStudent, async (req, res, next) => {
  const { data, error } = await req.userClient
    .from("reservations")
    .update({ status: "cancelada", cancelled_at: new Date().toISOString() })
    .eq("id", req.params.reservationId)
    .eq("student_id", req.authUser.id)
    .eq("status", "reservada")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Falha ao cancelar reserva:", error.message);
    return res.status(503).json({ error: "Não foi possível cancelar a reserva." });
  }
  if (!data) return res.status(404).json({ error: "Reserva não encontrada ou já cancelada." });
  return res.status(204).end();
});

app.get("/api/student/overview", requireAuth, requireStudent, async (req, res) => {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "A configuração segura do Supabase Admin está ausente no backend." });
  }

  const [{ data: memberships, error: membershipsError }, { data: attendance, error: attendanceError }, { data: payments, error: paymentsError }] = await Promise.all([
    adminClient.from("memberships")
      .select("id, status, starts_on, ends_on, plan:membership_plans(name, price, billing_interval, benefits)")
      .eq("student_id", req.authUser.id)
      .eq("status", "ativa")
      .order("starts_on", { ascending: false })
      .limit(1),
    adminClient.from("attendance")
      .select("id, status, marked_at, session:class_sessions(starts_at, class:classes(name))")
      .eq("student_id", req.authUser.id)
      .order("marked_at", { ascending: false })
      .limit(14),
    adminClient.from("payments")
      .select("id, amount, due_on, paid_at, method, status")
      .eq("student_id", req.authUser.id)
      .order("due_on", { ascending: false })
      .limit(20)
  ]);

  const queryError = membershipsError || attendanceError || paymentsError;
  if (queryError) {
    console.error("Falha ao carregar o resumo do aluno:", queryError.message);
    return res.status(503).json({ error: "Não foi possível carregar o resumo da conta." });
  }

  const presentCount = attendance.filter(item => item.status === "presente").length;
  const missedCount = attendance.filter(item => item.status === "falta").length;
  return res.json({
    membership: memberships[0] || null,
    attendance: {
      records: attendance,
      presentCount,
      missedCount,
      totalCount: attendance.length,
      percentage: attendance.length ? Math.round((presentCount / attendance.length) * 100) : 0
    },
    payments
  });
});

// Reúne indicadores, horários e reservas para a visão geral do admin.
app.get("/api/admin/dashboard", requireAuth, requireAdmin, async (_req, res) => {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para habilitar o painel administrativo." });
  }

  const now = new Date().toISOString();
  const [
    { count: studentCount, error: studentsError },
    { count: instructorCount, error: instructorsError },
    { count: classCount, error: classesError },
    { data: sessions, error: sessionsError },
    { data: recentReservations, error: reservationsError }
  ] = await Promise.all([
    adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "aluno").eq("status", "ativo"),
    adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "instrutor").eq("status", "ativo"),
    adminClient.from("classes").select("id", { count: "exact", head: true }).eq("active", true),
    adminClient.from("class_sessions")
      .select("id, starts_at, ends_at, capacity, location, status, class:classes(id, name, modality:modalities(name)), instructor:profiles!class_sessions_instructor_id_fkey(id, full_name)")
      .eq("status", "agendada")
      .gt("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(200),
    adminClient.from("reservations")
      .select("id, reserved_at, student:profiles!reservations_student_id_fkey(full_name), session:class_sessions(starts_at, class:classes(name))")
      .eq("status", "reservada")
      .order("reserved_at", { ascending: false })
      .limit(10)
  ]);

  const queryError = studentsError || instructorsError || classesError || sessionsError || reservationsError;
  if (queryError) {
    console.error("Falha ao carregar dashboard administrativo:", queryError.message);
    return res.status(503).json({ error: "Não foi possível carregar os dados do dashboard." });
  }

  const sessionIds = sessions.map(session => session.id);
  const { data: activeReservations, error: countError } = sessionIds.length
    ? await adminClient.from("reservations")
      .select("session_id")
      .in("session_id", sessionIds)
      .eq("status", "reservada")
    : { data: [], error: null };
  if (countError) {
    console.error("Falha ao contar reservas para o dashboard:", countError.message);
    return res.status(503).json({ error: "Não foi possível carregar as reservas do dashboard." });
  }

  const reservationCounts = new Map();
  activeReservations.forEach(reservation => {
    reservationCounts.set(reservation.session_id, (reservationCounts.get(reservation.session_id) || 0) + 1);
  });

  return res.json({
    metrics: {
      students: studentCount || 0,
      instructors: instructorCount || 0,
      classes: classCount || 0,
      upcomingSessions: sessions.length,
      reservations: activeReservations.length
    },
    upcomingSessions: sessions.map(session => ({
      ...session,
      reservedCount: reservationCounts.get(session.id) || 0
    })),
    recentReservations
  });
});

// Alimenta os seletores da tela com modalidades, aulas e instrutores ativos.
app.get("/api/admin/catalog", requireAuth, requireAdmin, async (_req, res) => {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para habilitar o painel administrativo." });
  }

  const [{ data: modalities, error: modalitiesError }, { data: classes, error: classesError }, { data: instructors, error: instructorsError }] = await Promise.all([
    adminClient.from("modalities").select("id, name").eq("active", true).order("name"),
    adminClient.from("classes").select("id, name, modality_id, duration_minutes, location, capacity").eq("active", true).order("name"),
    adminClient.from("profiles").select("id, full_name").eq("role", "instrutor").eq("status", "ativo").order("full_name")
  ]);

  const queryError = modalitiesError || classesError || instructorsError;
  if (queryError) {
    console.error("Falha ao carregar opções do painel admin:", queryError.message);
    return res.status(503).json({ error: "Não foi possível carregar as opções do painel." });
  }
  return res.json({ modalities, classes, instructors });
});

// Cria a ficha da aula; o horário é cadastrado separadamente.
app.post("/api/admin/classes", requireAuth, requireAdmin, async (req, res) => {
  const { name, modalityId, level, durationMinutes, location, capacity } = req.body || {};
  if (typeof name !== "string" || !name.trim() ||
      typeof modalityId !== "string" ||
      (level !== undefined && typeof level !== "string") ||
      (location !== undefined && typeof location !== "string") ||
      !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360 ||
      !Number.isInteger(capacity) || capacity < 1) {
    return res.status(400).json({ error: "Preencha modalidade, nome, duração e capacidade da aula." });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para habilitar o painel administrativo." });
  }
  const { data, error } = await adminClient.from("classes").insert({
    name: name.trim(),
    modality_id: modalityId,
    level: level?.trim() || "Todos os níveis",
    duration_minutes: durationMinutes,
    location: location?.trim() || "",
    capacity
  }).select("id, name, modality_id, duration_minutes, location, capacity").single();

  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Já existe uma aula com esse nome nessa modalidade." });
    if (error.code === "23503") return res.status(400).json({ error: "A modalidade selecionada não existe." });
    console.error("Falha ao cadastrar aula:", error.message);
    return res.status(503).json({ error: "Não foi possível cadastrar a aula." });
  }
  return res.status(201).json({ class: data });
});

// Agenda a aula escolhida e grava o instrutor responsável naquela sessão.
app.post("/api/admin/sessions", requireAuth, requireAdmin, async (req, res) => {
  const { classId, instructorId, startsAt } = req.body || {};
  const start = typeof startsAt === "string" ? new Date(startsAt) : null;
  if (typeof classId !== "string" || !classId ||
      (instructorId !== null && typeof instructorId !== "string") ||
      !start || Number.isNaN(start.getTime()) || start <= new Date()) {
    return res.status(400).json({ error: "Selecione a aula, o instrutor e um horário futuro válido." });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para habilitar o painel administrativo." });
  }
  const { data: classRecord, error: classError } = await adminClient.from("classes")
    .select("id, duration_minutes, location, capacity")
    .eq("id", classId)
    .eq("active", true)
    .maybeSingle();
  if (classError || !classRecord) {
    if (classError) console.error("Falha ao consultar aula para agendamento:", classError.message);
    return res.status(classError ? 503 : 404).json({ error: "A aula selecionada não está disponível." });
  }

  if (instructorId) {
    const { data: instructor, error: instructorError } = await adminClient.from("profiles")
      .select("id")
      .eq("id", instructorId)
      .eq("role", "instrutor")
      .eq("status", "ativo")
      .maybeSingle();
    if (instructorError || !instructor) {
      if (instructorError) console.error("Falha ao consultar instrutor:", instructorError.message);
      return res.status(instructorError ? 503 : 400).json({ error: "Selecione um instrutor ativo." });
    }
  }

  const end = new Date(start.getTime() + classRecord.duration_minutes * 60_000);
  const { data, error } = await adminClient.from("class_sessions").insert({
    class_id: classRecord.id,
    instructor_id: instructorId || null,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    location: classRecord.location,
    capacity: classRecord.capacity
  }).select("id, starts_at, ends_at").single();

  if (error) {
    console.error("Falha ao agendar aula:", error.message);
    return res.status(503).json({ error: "Não foi possível agendar esta aula." });
  }
  return res.status(201).json({ session: data });
});

// Permite trocar o instrutor de um horário futuro sem mexer nas reservas dos alunos.
app.patch("/api/admin/sessions/:sessionId/instructor", requireAuth, requireAdmin, async (req, res) => {
  const { instructorId } = req.body || {};
  if (instructorId !== null && typeof instructorId !== "string") {
    return res.status(400).json({ error: "Selecione um instrutor válido." });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para habilitar o painel administrativo." });
  }
  if (instructorId) {
    const { data: instructor, error } = await adminClient.from("profiles")
      .select("id")
      .eq("id", instructorId)
      .eq("role", "instrutor")
      .eq("status", "ativo")
      .maybeSingle();
    if (error || !instructor) {
      if (error) console.error("Falha ao validar instrutor para a aula:", error.message);
      return res.status(error ? 503 : 400).json({ error: "Selecione um instrutor ativo." });
    }
  }

  const { data, error } = await adminClient.from("class_sessions")
    .update({ instructor_id: instructorId })
    .eq("id", req.params.sessionId)
    .eq("status", "agendada")
    .gt("starts_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Falha ao atualizar instrutor da aula:", error.message);
    return res.status(503).json({ error: "Não foi possível atualizar o instrutor desta aula." });
  }
  if (!data) return res.status(404).json({ error: "Aula futura não encontrada." });
  return res.json({ message: "Instrutor da aula atualizado." });
});

// Monta a lista de instrutores com os dados do perfil e o e-mail do Auth.
app.get("/api/admin/instructors", requireAuth, requireAdmin, async (_req, res) => {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para habilitar o painel administrativo." });
  }

  const [{ data: profiles, error: profilesError }, { data: users, error: usersError }] = await Promise.all([
    adminClient.from("profiles")
      .select("id, full_name, status, created_at")
      .eq("role", "instrutor")
      .order("created_at", { ascending: false }),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);
  if (profilesError || usersError) {
    console.error("Falha ao listar instrutores:", profilesError?.message || usersError?.message);
    return res.status(503).json({ error: "Não foi possível carregar a lista de instrutores." });
  }

  const emailById = new Map(users.users.map(user => [user.id, user.email || ""]));
  return res.json({
    instructors: profiles.map(profile => ({
      id: profile.id,
      fullName: profile.full_name,
      email: emailById.get(profile.id) || "",
      status: profile.status,
      createdAt: profile.created_at
    }))
  });
});

// Convida a pessoa e só então dá a ela o papel de instrutor.
app.post("/api/admin/instructors/invite", requireAuth, requireAdmin, async (req, res) => {
  const { name, email } = req.body || {};
  if (typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Informe o nome e um e-mail válido." });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para enviar convites." });
  }

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
    data: { full_name: name.trim() },
    redirectTo: `${frontendUrl}/email-confirmed.html`
  });
  if (error || !data.user) {
    if (error?.status === 429) {
      return res.status(429).json({ error: "Limite de envio atingido. Aguarde antes de convidar novamente." });
    }
    console.error("Falha ao convidar instrutor:", error?.message || "Supabase não retornou o usuário.");
    return res.status(400).json({
      error: "Não foi possível enviar o convite. O e-mail pode já estar cadastrado ou a entrega de e-mails pode não estar configurada."
    });
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ full_name: name.trim(), role: "instrutor", status: "ativo" })
    .eq("id", data.user.id);
  if (profileError) {
    console.error("Convite criado, mas falhou ao atribuir o papel de instrutor:", profileError.message);
    return res.status(503).json({
      error: "O convite foi enviado, mas não foi possível configurar o perfil. Contate o administrador do sistema."
    });
  }

  return res.status(201).json({
    message: `Convite enviado para ${email.trim()}. O instrutor deverá definir a senha pelo link recebido.`
  });
});

// Se algo escapar do esperado, registra no servidor e responde sem despejar detalhes no site.
app.use((error, _req, res, _next) => {
  console.error("Erro inesperado na API:", error);
  res.status(500).json({ error: "Erro interno do servidor." });
});

// Sobe o servidor na porta configurada; se não houver uma, usa a padrão do projeto.
const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
