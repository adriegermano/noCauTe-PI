document.addEventListener('DOMContentLoaded', () => {
    // O painel carrega tudo da API; nenhum número vem de chute ou planilha fantasma.
    const apiBaseUrl = 'http://localhost:3001';
    const message = document.getElementById('admin-message');
    const inviteForm = document.getElementById('invite-form');
    const classForm = document.getElementById('class-form');
    const sessionForm = document.getElementById('session-form');
    const instructorsBody = document.getElementById('instructors-body');
    const sessionsBody = document.getElementById('sessions-body');
    const reservationsBody = document.getElementById('reservations-body');
    const classSelect = document.getElementById('session-class');
    const instructorSelect = document.getElementById('session-instructor');
    const modalitySelect = document.getElementById('class-modality');
    let catalog = { modalities: [], classes: [], instructors: [] };

    // Deixa o resultado da operação visível, inclusive quando a API disser "não".
    function showMessage(text, type = 'success') {
        message.textContent = text;
        message.dataset.type = type;
        message.hidden = false;
        message.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Usa a sessão atual em cada pedido e mostra a mensagem devolvida pelo servidor.
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
            return { response, data: response.status === 204 ? null : await response.json() };
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
            const error = new Error(data?.error || 'A solicitação não foi concluída.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function addCell(row, text) {
        const cell = document.createElement('td');
        cell.textContent = text || '—';
        row.append(cell);
        return cell;
    }

    function addEmptyRow(body, columns, text) {
        const row = document.createElement('tr');
        const cell = addCell(row, text);
        cell.colSpan = columns;
        cell.className = 'admin-empty';
        body.replaceChildren(row);
    }

    function formatDate(value, options = {}) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
    }

    function setMetrics(metrics) {
        document.getElementById('metric-students').textContent = metrics.students.toLocaleString('pt-BR');
        document.getElementById('metric-instructors').textContent = metrics.instructors.toLocaleString('pt-BR');
        document.getElementById('metric-classes').textContent = metrics.classes.toLocaleString('pt-BR');
        document.getElementById('metric-sessions').textContent = metrics.upcomingSessions.toLocaleString('pt-BR');
        document.getElementById('metric-reservations').textContent = metrics.reservations.toLocaleString('pt-BR');
    }

    function instructorOptions(selectedId) {
        const select = document.createElement('select');
        select.className = 'session-instructor-select';
        select.setAttribute('aria-label', 'Instrutor responsável pela aula');
        const noInstructor = document.createElement('option');
        noInstructor.value = '';
        noInstructor.textContent = 'Sem instrutor';
        select.append(noInstructor);
        catalog.instructors.forEach(instructor => {
            const option = document.createElement('option');
            option.value = instructor.id;
            option.textContent = instructor.full_name || 'Instrutor';
            select.append(option);
        });
        select.value = selectedId || '';
        return select;
    }

    async function updateSessionInstructor(sessionId, select) {
        const previousValue = select.dataset.savedValue || '';
        select.disabled = true;
        try {
            await apiRequest(`/api/admin/sessions/${encodeURIComponent(sessionId)}/instructor`, {
                method: 'PATCH',
                body: JSON.stringify({ instructorId: select.value || null })
            });
            select.dataset.savedValue = select.value;
            showMessage('Instrutor da aula atualizado.');
            await loadDashboard();
        } catch (error) {
            select.value = previousValue;
            showMessage(error.message, 'error');
        } finally {
            select.disabled = false;
        }
    }

    function renderSessions(sessions) {
        if (!sessions.length) {
            addEmptyRow(sessionsBody, 4, 'Nenhuma aula futura cadastrada. Agende a primeira na seção “Aulas e horários”.');
            return;
        }

        const rows = sessions.map(session => {
            const row = document.createElement('tr');
            const className = session.class?.name || 'Aula';
            const modalityName = session.class?.modality?.name;
            addCell(row, modalityName ? `${className} · ${modalityName}` : className);
            addCell(row, formatDate(session.starts_at, { dateStyle: 'short', timeStyle: 'short' }));
            addCell(row, `${session.reservedCount}/${session.capacity}`);
            const instructorCell = document.createElement('td');
            const select = instructorOptions(session.instructor?.id);
            select.dataset.savedValue = select.value;
            select.addEventListener('change', () => updateSessionInstructor(session.id, select));
            instructorCell.append(select);
            row.append(instructorCell);
            return row;
        });
        sessionsBody.replaceChildren(...rows);
    }

    function renderRecentReservations(reservations) {
        if (!reservations.length) {
            addEmptyRow(reservationsBody, 4, 'Ainda não há reservas de alunos.');
            return;
        }
        const rows = reservations.map(reservation => {
            const row = document.createElement('tr');
            addCell(row, reservation.student?.full_name || 'Aluno');
            addCell(row, reservation.session?.class?.name || 'Aula');
            addCell(row, formatDate(reservation.session?.starts_at, { dateStyle: 'short', timeStyle: 'short' }));
            addCell(row, formatDate(reservation.reserved_at, { dateStyle: 'short', timeStyle: 'short' }));
            return row;
        });
        reservationsBody.replaceChildren(...rows);
    }

    // Atualiza contadores, horários, instrutores e reservas consultando a base.
    async function loadDashboard() {
        const result = await apiRequest('/api/admin/dashboard');
        setMetrics(result.metrics);
        renderSessions(result.upcomingSessions);
        renderRecentReservations(result.recentReservations);
    }

    async function loadInstructors() {
        const { instructors } = await apiRequest('/api/admin/instructors');
        if (!instructors.length) {
            addEmptyRow(instructorsBody, 4, 'Nenhum instrutor cadastrado.');
            return;
        }
        const rows = instructors.map(instructor => {
            const row = document.createElement('tr');
            addCell(row, instructor.fullName);
            addCell(row, instructor.email);
            addCell(row, instructor.status);
            addCell(row, formatDate(instructor.createdAt, { dateStyle: 'short' }));
            return row;
        });
        instructorsBody.replaceChildren(...rows);
    }

    function fillSelect(select, items, placeholder, getLabel) {
        select.replaceChildren();
        const firstOption = document.createElement('option');
        firstOption.value = '';
        firstOption.textContent = placeholder;
        select.append(firstOption);
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = getLabel(item);
            select.append(option);
        });
    }

    // Preenche as listas com o que já existe no banco.
    async function loadCatalog() {
        catalog = await apiRequest('/api/admin/catalog');
        fillSelect(modalitySelect, catalog.modalities, 'Selecione uma modalidade', modality => modality.name);
        fillSelect(classSelect, catalog.classes, 'Selecione uma aula', item => item.name);
        fillSelect(instructorSelect, catalog.instructors, 'Selecione um instrutor', item => item.full_name || 'Instrutor');
    }

    // Envia convite de instrutor e atualiza o painel sem recarregar a página.
    inviteForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = inviteForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            const result = await apiRequest('/api/admin/instructors/invite', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('instructor-name').value.trim(),
                    email: document.getElementById('instructor-email').value.trim()
                })
            });
            showMessage(result.message);
            inviteForm.reset();
            await loadCatalog();
            await Promise.all([loadInstructors(), loadDashboard()]);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            submit.disabled = false;
        }
    });

    // Cria a ficha da aula para depois ela poder receber horários.
    classForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = classForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            await apiRequest('/api/admin/classes', {
                method: 'POST',
                body: JSON.stringify({
                    modalityId: modalitySelect.value,
                    name: document.getElementById('class-name').value.trim(),
                    level: document.getElementById('class-level').value.trim(),
                    durationMinutes: Number(document.getElementById('class-duration').value),
                    location: document.getElementById('class-location').value.trim(),
                    capacity: Number(document.getElementById('class-capacity').value)
                })
            });
            showMessage('Aula cadastrada. Agora você já pode agendar um horário para ela.');
            classForm.reset();
            document.getElementById('class-level').value = 'Todos os níveis';
            document.getElementById('class-duration').value = '60';
            document.getElementById('class-capacity').value = '20';
            await loadCatalog();
            await loadDashboard();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            submit.disabled = false;
        }
    });

    // Agenda um horário e liga a sessão ao instrutor escolhido.
    sessionForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = sessionForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            await apiRequest('/api/admin/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    classId: classSelect.value,
                    instructorId: instructorSelect.value,
                    startsAt: new Date(document.getElementById('session-start').value).toISOString()
                })
            });
            showMessage('Aula agendada e instrutor relacionado. Os alunos já podem reservar a vaga.');
            sessionForm.reset();
            await loadDashboard();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            submit.disabled = false;
        }
    });

    document.getElementById('refresh-dashboard').addEventListener('click', () => {
        loadDashboard().catch(error => showMessage(error.message, 'error'));
    });
    document.getElementById('refresh-instructors').addEventListener('click', () => {
        loadInstructors().catch(error => showMessage(error.message, 'error'));
    });

    document.querySelectorAll('.sidebar-nav a[href^="#"]').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => item.classList.toggle('active', item === link));
        });
    });

    // Atualiza tudo ao abrir e renova os dados de tempos em tempos.
    loadCatalog().then(() => Promise.all([loadDashboard(), loadInstructors()])).catch(error => {
        console.error('Falha ao carregar o painel administrativo.', error);
        showMessage(error.message, 'error');
        addEmptyRow(sessionsBody, 4, 'Não foi possível carregar as aulas.');
        addEmptyRow(reservationsBody, 4, 'Não foi possível carregar as reservas.');
        addEmptyRow(instructorsBody, 4, 'Não foi possível carregar os instrutores.');
    });

    const startInput = document.getElementById('session-start');
    const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    startInput.min = localNow;

    window.setInterval(() => {
        loadDashboard().catch(error => console.error('Falha ao atualizar o dashboard.', error));
    }, 30_000);
});
