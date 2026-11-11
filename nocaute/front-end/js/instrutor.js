document.addEventListener('DOMContentLoaded', () => {
    const apiBaseUrl = 'http://localhost:3001';
    const navItems = [...document.querySelectorAll('.nav-item[data-target]')];
    const views = [...document.querySelectorAll('.view-section')];
    const toastRegion = document.createElement('div');
    toastRegion.className = 'dashboard-toast-region';
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('aria-relevant', 'additions');
    document.body.append(toastRegion);

    let data;
    let selectedSessionId = null;
    let savingAttendance = false;
    const charts = [];

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `dashboard-toast is-${type}`;
        toast.setAttribute('role', type === 'warning' ? 'alert' : 'status');
        const text = document.createElement('p');
        text.textContent = message;
        const closeButton = document.createElement('button');
        closeButton.className = 'dashboard-toast-close';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Fechar aviso');
        closeButton.textContent = 'x';
        closeButton.addEventListener('click', () => toast.remove());
        toast.append(text, closeButton);
        toastRegion.append(toast);
        window.setTimeout(() => toast.remove(), 5000);
    }

    async function apiRequest(path, options = {}) {
        const send = async token => {
            const response = await fetch(`${apiBaseUrl}${path}`, {
                ...options,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    ...options.headers
                }
            });
            const result = response.status === 204 ? null : await response.json();
            return { response, result };
        };

        let accessToken = sessionStorage.getItem('nocaute.accessToken');
        let { response, result } = await send(accessToken);
        if (response.status === 401) {
            const refreshToken = sessionStorage.getItem('nocaute.refreshToken');
            if (refreshToken) {
                const refreshResponse = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                });
                const refreshed = await refreshResponse.json();
                if (refreshResponse.ok) {
                    accessToken = refreshed.accessToken;
                    sessionStorage.setItem('nocaute.accessToken', refreshed.accessToken);
                    sessionStorage.setItem('nocaute.refreshToken', refreshed.refreshToken);
                    ({ response, result } = await send(accessToken));
                }
            }
        }
        if (!response.ok) {
            const error = new Error(result?.error || 'Não foi possível carregar os dados do instrutor.');
            error.status = response.status;
            throw error;
        }
        return result;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function localDateKey(value = new Date()) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }

    function formatTime(value) {
        return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    }

    function formatDate(value, options = { weekday: 'short', day: '2-digit', month: '2-digit' }) {
        return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
    }

    function switchView(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return;
        navItems.forEach(button => {
            const active = button.dataset.target === targetId;
            button.classList.toggle('active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        views.forEach(view => view.classList.toggle('active', view === target));
        window.scrollTo(0, 0);
    }

    navItems.forEach(button => {
        button.title = `Abrir ${button.textContent.trim()}`;
        button.addEventListener('click', () => switchView(button.dataset.target));
    });

    function sessionName(session) {
        return session.class?.name || 'Aula';
    }

    function attendanceButton(session, label = 'Fazer Chamada') {
        const button = element('button', 'btn btn-outline btn-go-chamada', label);
        button.type = 'button';
        button.dataset.sessionId = session.id;
        button.addEventListener('click', () => {
            selectSession(session.id);
            switchView('view-presencas');
        });
        return button;
    }

    function renderMetrics() {
        const todaySessions = data.sessions.filter(session =>
            session.status === 'agendada' && localDateKey(new Date(session.starts_at)) === localDateKey()
        );
        document.getElementById('metric-aulas-hoje').textContent = String(todaySessions.length);
        document.getElementById('metric-alunos-hoje').textContent = String(
            todaySessions.reduce((total, session) => total + session.roster.length, 0)
        );
        const pending = data.sessions.filter(session =>
            session.status !== 'cancelada' &&
            new Date(session.starts_at) <= new Date() &&
            session.roster.length > 0 &&
            session.roster.some(student => !student.attendance)
        ).length;
        document.getElementById('metric-chamadas-pendentes').textContent = String(pending);

        const agenda = document.getElementById('agenda-instrutor');
        agenda.replaceChildren();
        if (!todaySessions.length) {
            agenda.append(element('li', 'grade-item', 'Nenhuma aula atribuída para hoje.'));
            return;
        }
        todaySessions.forEach(session => {
            const item = element('li', 'grade-item');
            const time = element('strong', '', formatTime(session.starts_at));
            item.append(time, document.createTextNode(` ${sessionName(session)} `), attendanceButton(session));
            agenda.append(item);
        });
    }

    function renderStudents() {
        const body = document.getElementById('lista-alunos');
        body.replaceChildren();
        if (!data.students.length) {
            const row = element('tr');
            const cell = element('td', '', 'Nenhum aluno tem reserva nas suas aulas ainda.');
            cell.colSpan = 3;
            row.append(cell);
            body.append(row);
            return;
        }
        data.students.forEach(student => {
            const row = element('tr');
            row.append(
                element('td', '', student.fullName || 'Aluno'),
                element('td', '', student.plan || 'Sem plano ativo'),
                element('td', student.status === 'ativo' ? 'status-presente' : 'status-falta',
                    student.status === 'ativo' ? 'Ativo' : 'Inativo')
            );
            body.append(row);
        });
    }

    function renderClasses() {
        const list = document.getElementById('lista-aulas');
        const dateLabel = document.getElementById('data-aulas');
        dateLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        }).format(new Date());
        list.replaceChildren();
        const upcoming = data.sessions.filter(session =>
            session.status === 'agendada' &&
            localDateKey(new Date(session.starts_at)) === localDateKey()
        );
        if (!upcoming.length) {
            list.append(element('p', '', 'Nenhuma aula atribuída para hoje.'));
            return;
        }
        upcoming.forEach(session => {
            const card = element('article', 'class-card');
            const time = element('div', 'class-time', formatTime(session.starts_at));
            time.append(element('span', '', `${session.class?.duration_minutes || 0} min`));
            const info = element('div', 'class-info');
            info.append(element('h4', '', sessionName(session)));
            const details = element('p', 'class-details');
            details.textContent = `${formatDate(session.starts_at)} · ${session.location || 'Local não informado'} · ${session.roster.length}/${session.capacity || 0} vagas ocupadas`;
            info.append(details);
            card.append(time, info, attendanceButton(session, 'Ver Chamada'));
            list.append(card);
        });
    }

    function renderSchedules() {
        const container = document.getElementById('lista-turmas');
        container.replaceChildren();
        if (!data.schedules.length) {
            container.append(element('p', '', 'Nenhum horário regular atribuído a você.'));
            return;
        }
        const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        data.schedules.forEach(schedule => {
            const card = element('article', 'plan-card-aulas');
            const top = element('div', 'card-top');
            top.append(
                element('span', 'category-name', schedule.class?.modality?.name || 'Aula'),
                element('span', 'level-tag', schedule.class?.level || 'Todos os níveis')
            );
            const heading = element('h3', '', schedule.class?.name || 'Aula');
            const details = element('ul', 'info-list');
            const when = element('li');
            when.append(
                element('span'),
                document.createTextNode(`${weekdays[schedule.weekday] || 'Dia não informado'} · ${String(schedule.starts_at).slice(0, 5)} (${schedule.class?.duration_minutes || 0} min)`)
            );
            const where = element('li');
            where.append(
                element('span'),
                document.createTextNode(`${schedule.class?.location || 'Local não informado'} · ${schedule.class?.capacity || 0} vagas`)
            );
            details.append(when, where);
            card.append(top, heading, details);
            container.append(card);
        });
    }

    function selectSession(sessionId) {
        selectedSessionId = sessionId;
        renderAttendance();
    }

    function renderAttendance() {
        const filters = document.getElementById('filtros-chamada');
        const body = document.getElementById('corpo-chamada');
        const saveButton = document.getElementById('btn-salvar-chamada');
        const eligible = data.sessions.filter(session =>
            new Date(session.starts_at) <= new Date() && session.status !== 'cancelada'
        );
        filters.replaceChildren();
        body.replaceChildren();
        if (!eligible.some(session => session.id === selectedSessionId)) {
            selectedSessionId = eligible[0]?.id || null;
        }
        eligible.forEach(session => {
            const button = element('button', `filter-btn${session.id === selectedSessionId ? ' active' : ''}`,
                `${formatDate(session.starts_at)} ${formatTime(session.starts_at)} · ${sessionName(session)}`);
            button.type = 'button';
            button.addEventListener('click', () => selectSession(session.id));
            filters.append(button);
        });
        const session = eligible.find(item => item.id === selectedSessionId);
        if (!session) {
            const row = element('tr');
            const cell = element('td', '', 'Não há aula iniciada disponível para chamada.');
            cell.colSpan = 2;
            row.append(cell);
            body.append(row);
            saveButton.disabled = true;
            return;
        }
        if (!session.roster.length) {
            const row = element('tr');
            const cell = element('td', '', 'Nenhum aluno reservou esta aula.');
            cell.colSpan = 2;
            row.append(cell);
            body.append(row);
            saveButton.disabled = true;
            return;
        }
        session.roster.forEach(student => {
            const row = element('tr');
            row.dataset.studentId = student.studentId;
            const name = element('td', '', student.fullName || 'Aluno');
            const controls = element('td');
            const group = element('div', 'btn-group');
            [
                ['presente', '✔ Presente'],
                ['falta', 'X Falta']
            ].forEach(([status, label]) => {
                const button = element('button', `btn btn-outline btn-chamada${student.attendance === status ? ' active' : ''}`, label);
                button.type = 'button';
                button.dataset.status = status;
                button.setAttribute('aria-pressed', String(student.attendance === status));
                button.addEventListener('click', () => {
                    row.querySelectorAll('.btn-chamada').forEach(item => {
                        const active = item === button;
                        item.classList.toggle('active', active);
                        item.setAttribute('aria-pressed', String(active));
                    });
                    row.classList.add('attendance-complete');
                });
                group.append(button);
            });
            controls.append(group);
            row.append(name, controls);
            body.append(row);
        });
        saveButton.disabled = false;
    }

    function updateChart(canvasId, labels, values, label = '') {
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        let chart = charts.find(item => item.canvasId === canvasId)?.chart;
        if (!chart) {
            const options = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, border: { display: false } },
                    y: { beginAtZero: true, border: { display: false }, grid: { color: '#f3f4f6' } }
                }
            };
            chart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: { labels: [], datasets: [{ label, data: [], backgroundColor: '#ffc933' }] },
                options
            });
            charts.push({ canvasId, chart });
        }
        chart.data.labels = labels;
        chart.data.datasets[0].label = label;
        chart.data.datasets[0].data = values;
        chart.update();
    }

    function renderReports() {
        const reports = data.reports;
        document.getElementById('report-presenca').textContent = `${reports.attendanceRate}%`;
        document.getElementById('report-ocupacao').textContent = `${reports.occupancyRate}%`;
        document.getElementById('report-novos-alunos').textContent = String(reports.newStudents);
        const attendanceLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        const attendanceValues = [1, 2, 3, 4, 5, 6, 0].map(day => reports.attendanceByWeekday[day] || 0);
        updateChart('chartPresencas1', attendanceLabels, attendanceValues, 'Presenças');
        updateChart('chartPresencas2', attendanceLabels, attendanceValues, 'Presenças');
        updateChart('chartOcupacao',
            reports.occupancyByClass.map(item => item.name),
            reports.occupancyByClass.map(item => item.percentage),
            'Ocupação (%)');
        updateChart('chartModalidade',
            reports.studentsByModality.map(item => item.name),
            reports.studentsByModality.map(item => item.count),
            'Alunos');
    }

    document.getElementById('btn-salvar-chamada').addEventListener('click', async event => {
        if (savingAttendance || !selectedSessionId) return;
        const saveButton = event.currentTarget;
        const rows = [...document.querySelectorAll('#corpo-chamada tr[data-student-id]')];
        const records = rows.map(row => ({
            studentId: row.dataset.studentId,
            status: row.querySelector('.btn-chamada.active')?.dataset.status
        }));
        const pending = records.filter(record => !record.status).length;
        if (pending) {
            showToast(`Marque presença ou falta para os ${pending} aluno(s) pendente(s).`, 'warning');
            return;
        }

        savingAttendance = true;
        saveButton.disabled = true;
        try {
            await apiRequest('/api/instructor/attendance', {
                method: 'POST',
                body: JSON.stringify({ sessionId: selectedSessionId, records })
            });
            showToast('Chamada salva no sistema.');
            await loadOverview();
        } catch (error) {
            showToast(error.message, 'warning');
        } finally {
            savingAttendance = false;
            saveButton.disabled = false;
        }
    });

    async function loadOverview() {
        data = await apiRequest('/api/instructor/overview');
        renderMetrics();
        renderStudents();
        renderClasses();
        renderSchedules();
        renderAttendance();
        renderReports();
    }

    loadOverview().catch(error => {
        console.error('Falha ao carregar o painel do instrutor:', error);
        showToast(error.message, 'warning');
    });
    window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadOverview().catch(error => {
                console.error('Falha ao atualizar o painel do instrutor:', error);
                showToast(error.message, 'warning');
            });
        }
    }, 60000);
});
