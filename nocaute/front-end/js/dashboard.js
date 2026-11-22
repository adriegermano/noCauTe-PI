document.addEventListener('DOMContentLoaded', () => {
    // O painel do aluno consulta horários e reservas reais, sem inventar treino.
    const apiBaseUrl = 'http://localhost:3001';
    const navItems = [...document.querySelectorAll('.nav-item[data-target]')];
    const views = [...document.querySelectorAll('.view-section')];
    const toastRegion = document.createElement('div');
    toastRegion.className = 'dashboard-toast-region';
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('aria-relevant', 'additions');
    document.body.append(toastRegion);

    let userName = 'Aluno';
    try {
        const user = JSON.parse(sessionStorage.getItem('nocaute.currentUser') || 'null');
        if (user?.profile === 'aluno' && user.firstName) userName = user.firstName;
    } catch (error) {
        console.warn('Não foi possível ler o nome salvo da conta.', error);
    }
    document.getElementById('perfil-nome')?.replaceChildren(document.createTextNode(userName));
    document.getElementById('boas-vindas-nome')?.replaceChildren(document.createTextNode(userName));

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `dashboard-toast is-${type}`;
        toast.setAttribute('role', type === 'warning' ? 'alert' : 'status');
        const symbol = document.createElement('span');
        symbol.className = 'dashboard-toast-icon';
        symbol.setAttribute('aria-hidden', 'true');
        symbol.textContent = type === 'warning' ? '!' : type === 'info' ? 'i' : 'OK';
        const text = document.createElement('p');
        text.textContent = message;
        const closeButton = document.createElement('button');
        closeButton.className = 'dashboard-toast-close';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Fechar aviso');
        closeButton.title = 'Fechar aviso';
        closeButton.textContent = 'x';
        const dismiss = () => {
            window.clearTimeout(toast.dismissTimer);
            toast.remove();
        };
        closeButton.addEventListener('click', dismiss);
        toast.append(symbol, text, closeButton);
        toastRegion.append(toast);
        toast.dismissTimer = window.setTimeout(dismiss, 4200);
    }

    function switchView(targetId) {
        const targetView = views.find(view => view.id === targetId);
        if (!targetView) return;
        navItems.forEach(button => {
            const isActive = button.dataset.target === targetId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
        views.forEach(view => view.classList.toggle('active', view === targetView));
        window.scrollTo(0, 0);
    }

    navItems.forEach(button => {
        button.title = `Abrir ${button.textContent.trim()}`;
        button.addEventListener('click', () => switchView(button.dataset.target));
    });

    const classesList = document.querySelector('.classes-list');
    const dateSelector = document.querySelector('.date-selector');
    const filterContainer = document.querySelector('.filters');
    const agendaCount = document.getElementById('agenda-count');
    const statReservations = document.getElementById('stat-reservadas');
    const agendaList = document.getElementById('agenda-list');
    const agendaEmpty = document.getElementById('agenda-empty');
    const upcomingContainer = document.getElementById('proximas-aulas-container');
    const homeSchedule = document.getElementById('upcoming-schedule');
    const dayTitle = document.querySelector('.day-title');
    const attendanceBody = document.getElementById('attendance-body');
    const paymentsBody = document.getElementById('payments-body');
    let sessions = [];
    let reservations = [];
    let selectedDate = '';
    let selectedCategory = 'todos';

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function formatDateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function formatTime(value) {
        return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    }

    function formatDate(value, options = { weekday: 'long', day: '2-digit', month: '2-digit' }) {
        return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }

    function formatDatabaseDate(value) {
        return value ? value.split('-').reverse().join('/') : '—';
    }

    function normalizeText(value) {
        return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    }

    // Se o acesso venceu, tenta renová-lo e repetir a chamada.
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
            const data = response.status === 204 ? null : await response.json();
            return { response, data };
        };

        let accessToken = sessionStorage.getItem('nocaute.accessToken');
        let { response, data } = await send(accessToken);
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
                    ({ response, data } = await send(accessToken));
                }
            }
        }
        if (!response.ok) {
            const error = new Error(data?.error || 'Não foi possível carregar as aulas.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function currentReservations() {
        const sessionById = new Map(sessions.map(session => [session.id, session]));
        return reservations
            .map(reservation => ({ ...reservation, session: sessionById.get(reservation.session_id) }))
            .filter(reservation => reservation.session);
    }

    // Atualiza agenda e próximos treinos com as reservas que vieram do servidor.
    function updateSummary() {
        const activeReservations = currentReservations();
        if (agendaCount) agendaCount.textContent = String(activeReservations.length);
        if (statReservations) statReservations.textContent = String(activeReservations.length);

        agendaList.replaceChildren();
        if (!activeReservations.length) {
            agendaEmpty.hidden = false;
            agendaList.append(agendaEmpty);
        } else {
            agendaEmpty.hidden = true;
            activeReservations.forEach(reservation => {
                const session = reservation.session;
                const card = createElement('div', 'class-card');
                const time = createElement('div', 'class-time', formatTime(session.starts_at));
                time.append(createElement('span', '', formatDate(session.starts_at)));
                const info = createElement('div', 'class-info');
                info.append(createElement('h4', '', session.class?.name || 'Aula'));
                info.append(createElement('p', 'class-tags', `INSTRUTOR: ${session.instructor?.full_name || 'A definir'}`));
                card.append(time, info);
                agendaList.append(card);
            });
        }

        upcomingContainer.replaceChildren();
        homeSchedule.replaceChildren();
        if (!activeReservations.length) {
            upcomingContainer.append(createElement('p', '', 'Você ainda não reservou nenhuma aula.'));
            const viewClassesButton = createElement('button', 'btn btn-outline btn-go-horarios', 'Ver horários disponíveis');
            viewClassesButton.type = 'button';
            upcomingContainer.append(viewClassesButton);
            homeSchedule.append(createElement('li', 'grade-item', 'Suas aulas reservadas aparecerão aqui.'));
        } else {
            const list = createElement('ul', 'grade-list');
            activeReservations.forEach(reservation => {
                const session = reservation.session;
                const item = createElement('li', 'grade-item');
                item.append(
                    createElement('strong', '', formatTime(session.starts_at)),
                    document.createTextNode(` ${session.class?.name || 'Aula'} · ${session.instructor?.full_name || 'Instrutor a definir'}`)
                );
                list.append(item);
                const homeItem = createElement('li', 'grade-item');
                homeItem.append(
                    createElement('strong', '', `${formatDate(session.starts_at)} · ${formatTime(session.starts_at)}`),
                    document.createTextNode(` ${session.class?.name || 'Aula'} · ${session.instructor?.full_name || 'Instrutor a definir'}`)
                );
                homeSchedule.append(homeItem);
            });
            upcomingContainer.append(list);
        }
    }

    function renderStudentOverview(overview) {
        const membership = overview.membership;
        const plan = Array.isArray(membership?.plan) ? membership.plan[0] : membership?.plan;
        document.getElementById('student-plan-name').textContent = plan?.name || 'Sem plano ativo';
        document.getElementById('student-plan-price').textContent = plan
            ? `${formatCurrency(plan.price)} / ${plan.billing_interval}`
            : 'Entre em contato com a academia';
        document.getElementById('membership-name').textContent = plan?.name || 'Nenhum plano ativo';
        document.getElementById('membership-description').textContent = plan
            ? (Array.isArray(plan.benefits) && plan.benefits.length ? plan.benefits.join(' · ') : 'Plano ativo')
            : 'Ainda não há plano ativo vinculado à sua conta.';
        document.getElementById('membership-period').textContent = membership
            ? `Vigência: ${formatDatabaseDate(membership.starts_on)}${membership.ends_on ? ` até ${formatDatabaseDate(membership.ends_on)}` : ''}`
            : '';

        const attendance = overview.attendance;
        document.getElementById('student-attendance-rate').textContent = `${attendance.percentage}%`;
        document.getElementById('student-attendance-count').textContent = String(attendance.presentCount);
        document.getElementById('attendance-present-count').textContent = String(attendance.presentCount);
        document.getElementById('attendance-missed-count').textContent = String(attendance.missedCount);
        document.getElementById('attendance-percentage').textContent = `${attendance.percentage}%`;

        if (attendance.records.length) {
            attendanceBody.replaceChildren(...attendance.records.map(record => {
                const row = document.createElement('tr');
                row.append(
                    createElement('td', '', formatDate(record.marked_at, { dateStyle: 'short' })),
                    createElement('td', '', record.session?.class?.name || 'Aula'),
                    createElement('td', '', record.session?.starts_at ? formatTime(record.session.starts_at) : '—')
                );
                const status = createElement('td', '', {
                    presente: 'Presente',
                    falta: 'Falta',
                    justificada: 'Justificada'
                }[record.status] || '—');
                status.className = record.status === 'presente' ? 'status-presente' : record.status === 'falta' ? 'status-falta' : '';
                row.append(status);
                return row;
            }));
        } else {
            const row = document.createElement('tr');
            const cell = createElement('td', '', 'Ainda não há presenças registradas.');
            cell.colSpan = 4;
            cell.className = 'admin-empty';
            row.append(cell);
            attendanceBody.replaceChildren(row);
        }

        if (overview.payments.length) {
            paymentsBody.replaceChildren(...overview.payments.map(payment => {
                const row = document.createElement('tr');
                row.append(
                    createElement('td', '', formatDatabaseDate(payment.due_on)),
                    createElement('td', '', formatCurrency(payment.amount)),
                    createElement('td', '', payment.method || '—')
                );
                const status = createElement('td', '', payment.status);
                status.className = ['pago', 'estornado'].includes(payment.status) ? 'status-presente' : ['atrasado', 'cancelado'].includes(payment.status) ? 'status-falta' : '';
                row.append(status);
                return row;
            }));
        } else {
            const row = document.createElement('tr');
            const cell = createElement('td', '', 'Ainda não há faturas cadastradas.');
            cell.colSpan = 4;
            cell.className = 'admin-empty';
            row.append(cell);
            paymentsBody.replaceChildren(row);
        }
    }

    // A semana é montada a partir de hoje, não de uma data de demonstração.
    function renderDates() {
        const dates = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + index);
            return date;
        });
        dateSelector.replaceChildren(...dates.map((date, index) => {
            const button = createElement('button', `date-btn${index === 0 ? ' active' : ''}`);
            button.type = 'button';
            button.dataset.date = formatDateKey(date);
            button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
            button.append(createElement('h5', '', index === 0 ? 'HOJE' : formatDate(date, { weekday: 'short' }).toLocaleUpperCase('pt-BR')));
            button.append(createElement('p', '', formatDate(date, { day: '2-digit', month: '2-digit' })));
            button.addEventListener('click', () => {
                selectedDate = button.dataset.date;
                dateSelector.querySelectorAll('.date-btn').forEach(item => {
                    const active = item === button;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-pressed', String(active));
                });
                dayTitle.textContent = formatDate(date);
                renderSessions();
            });
            return button;
        }));
        selectedDate = dates.length ? formatDateKey(dates[0]) : '';
        dayTitle.textContent = formatDate(dates[0]);
    }

    function renderFilters() {
        const categories = [...new Set(sessions.map(session => session.class?.modality?.name).filter(Boolean))];
        filterContainer.replaceChildren();
        ['Todos', ...categories].forEach((category, index) => {
            const button = createElement('button', `filter-btn${index === 0 ? ' active' : ''}`, category);
            button.type = 'button';
            button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
            button.addEventListener('click', () => {
                selectedCategory = index === 0 ? 'todos' : normalizeText(category);
                filterContainer.querySelectorAll('.filter-btn').forEach(item => {
                    const active = item === button;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-pressed', String(active));
                });
                renderSessions();
            });
            filterContainer.append(button);
        });
    }

    // Cada horário mostra o instrutor associado e as vagas que ainda sobraram.
    function renderSessions() {
        const filtered = sessions.filter(session => {
            const dateMatches = !selectedDate || formatDateKey(new Date(session.starts_at)) === selectedDate;
            const categoryMatches = selectedCategory === 'todos' ||
                normalizeText(session.class?.modality?.name || '') === selectedCategory;
            return dateMatches && categoryMatches;
        });
        if (!filtered.length) {
            const emptyMessage = sessions.length
                ? 'Não há aulas disponíveis para este dia e modalidade.'
                : 'Ainda não há horários cadastrados. As próximas aulas aparecerão aqui.';
            classesList.replaceChildren(createElement('p', 'classes-empty', emptyMessage));
            return;
        }

        classesList.replaceChildren(...filtered.map(session => {
            const reservation = reservations.find(item => item.session_id === session.id);
            const className = session.class?.name || 'Aula';
            const modality = session.class?.modality?.name || 'Modalidade';
            const level = session.class?.level || 'Todos os níveis';
            const duration = Math.round((new Date(session.ends_at) - new Date(session.starts_at)) / 60_000);
            const available = Math.max(0, session.capacity - session.reservedCount);
            const card = createElement('div', 'class-card');
            const time = createElement('div', 'class-time', formatTime(session.starts_at));
            time.append(createElement('span', '', `${duration} min`));
            const info = createElement('div', 'class-info');
            info.append(createElement('h4', '', className));
            info.append(createElement('p', 'class-tags', `${modality} • ${level}`));
            info.append(createElement(
                'p',
                'class-details',
                `${session.instructor?.full_name || 'Instrutor a definir'} · ${session.location || 'Local a definir'} · ${available} vaga(s)`
            ));
            const button = createElement('button', `btn ${reservation ? 'btn-black' : 'btn-primary'} btn-reservar`, reservation ? 'Cancelar reserva' : 'Reservar');
            button.type = 'button';
            button.dataset.sessionId = session.id;
            button.disabled = available === 0 && !reservation;
            button.setAttribute('aria-pressed', String(Boolean(reservation)));
            card.append(time, info, button);
            return card;
        }));
    }

    // Busca horários, instrutores e reservas da conta logada.
    async function loadSessions() {
        const [result, overview] = await Promise.all([
            apiRequest('/api/student/sessions'),
            apiRequest('/api/student/overview')
        ]);
        sessions = result.sessions;
        reservations = result.reservations;
        renderFilters();
        renderSessions();
        updateSummary();
        renderStudentOverview(overview);
    }

    // Reserva ou cancela no banco; o painel só confirma depois da resposta.
    document.addEventListener('click', async event => {
        const reserveButton = event.target.closest('.btn-reservar');
        if (reserveButton) {
            reserveButton.disabled = true;
            const session = sessions.find(item => item.id === reserveButton.dataset.sessionId);
            const reservation = reservations.find(item => item.session_id === reserveButton.dataset.sessionId);
            try {
                if (reservation) {
                    await apiRequest(`/api/student/reservations/${encodeURIComponent(reservation.id)}`, { method: 'DELETE' });
                    showToast(`Reserva cancelada: ${session?.class?.name || 'aula'}.`, 'info');
                } else {
                    await apiRequest('/api/student/reservations', {
                        method: 'POST',
                        body: JSON.stringify({ sessionId: reserveButton.dataset.sessionId })
                    });
                    showToast(`Vaga reservada: ${session?.class?.name || 'aula'}.`);
                }
                await loadSessions();
            } catch (error) {
                showToast(error.message, 'warning');
                await loadSessions().catch(loadError => showToast(loadError.message, 'warning'));
            }
            return;
        }
        if (event.target.closest('.btn-go-horarios')) switchView('view-horarios');
    });

    document.getElementById('refresh-student-sessions').addEventListener('click', () => {
        loadSessions().catch(error => showToast(error.message, 'warning'));
    });

    renderDates();
    loadSessions().catch(error => {
        console.error('Falha ao carregar aulas e reservas do banco.', error);
        showToast(error.message, 'warning');
        classesList.replaceChildren(createElement('p', 'classes-empty', 'Não foi possível carregar as aulas. Tente atualizar a página.'));
    });
    window.setInterval(() => {
        loadSessions().catch(error => console.error('Falha ao atualizar o painel do aluno.', error));
    }, 30_000);
});
