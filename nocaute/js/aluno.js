document.addEventListener('DOMContentLoaded', () => {
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
    } catch {
        userName = 'Aluno';
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

    const storageKey = 'nocaute.aluno.aulas-reservadas';
    let aulasReservadas = [];
    try {
        const savedReservations = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(savedReservations)) aulasReservadas = savedReservations;
    } catch {
        aulasReservadas = [];
    }

    const reserveButtons = [...document.querySelectorAll('.btn-reservar')];
    const classCards = [...document.querySelectorAll('.classes-list .class-card')];
    const agendaCount = document.getElementById('agenda-count');
    const statReservadas = document.getElementById('stat-reservadas');
    const agendaList = document.getElementById('agenda-list');
    const agendaEmpty = document.getElementById('agenda-empty');
    const upcomingContainer = document.getElementById('proximas-aulas-container');
    const classesList = document.querySelector('.classes-list');
    const dayTitle = document.querySelector('.day-title');
    const dateButtons = [...document.querySelectorAll('.date-selector .date-btn')];
    const filterButtons = [...document.querySelectorAll('.filters .filter-btn')];
    let selectedDate = dateButtons.find(button => button.classList.contains('active'))?.querySelector('p')?.textContent.trim();
    let selectedCategory = 'todos';

    const classesEmpty = document.createElement('p');
    classesEmpty.className = 'classes-empty';
    classesEmpty.hidden = true;
    classesEmpty.textContent = 'Nenhuma aula cadastrada para este dia e modalidade.';
    classesList?.append(classesEmpty);

    const normalizeText = value => value
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    function updateClassFilters(showEmptyNotice = false) {
        let visibleCount = 0;

        classCards.forEach(card => {
            const matchesDate = !selectedDate || card.dataset.date === selectedDate;
            const tags = normalizeText(card.querySelector('.class-tags')?.textContent || '');
            const matchesCategory = selectedCategory === 'todos' || tags.includes(selectedCategory);
            const isVisible = matchesDate && matchesCategory;
            card.hidden = !isVisible;
            if (isVisible) visibleCount += 1;
        });

        if (classesEmpty) classesEmpty.hidden = visibleCount > 0;
        if (showEmptyNotice && visibleCount === 0) {
            showToast('Não há aulas cadastradas para esta seleção.', 'warning');
        }
    }

    dateButtons.forEach(button => {
        const date = button.querySelector('p')?.textContent.trim() || '';
        const weekday = button.querySelector('h5')?.textContent.trim() || '';
        button.dataset.date = date;
        button.title = `Ver aulas de ${weekday}, ${date}`;
        button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
        button.addEventListener('click', () => {
            dateButtons.forEach(item => {
                const active = item === button;
                item.classList.toggle('active', active);
                item.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            selectedDate = date;
            if (dayTitle) dayTitle.textContent = `${weekday}, ${date}`;
            updateClassFilters(true);
        });
    });

    classCards.forEach(card => {
        card.dataset.date ||= '09/09';
    });

    filterButtons.forEach(button => {
        button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
        button.addEventListener('click', () => {
            filterButtons.forEach(item => {
                const active = item === button;
                item.classList.toggle('active', active);
                item.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            selectedCategory = normalizeText(button.textContent);
            updateClassFilters(true);
        });
    });

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function setButtonContent(button, label, iconFile, title) {
        const icon = createElement('img', '', undefined);
        icon.src = `img/svg/${iconFile}`;
        icon.alt = '';
        icon.setAttribute('aria-hidden', 'true');

        const text = createElement('span', '', label);
        button.classList.add('dashboard-icon-button');
        button.title = title;
        button.replaceChildren(icon, text);
    }

    document.querySelectorAll('.btn-go-horarios').forEach(button => {
        setButtonContent(button, button.textContent.trim(), 'icon-aulas.png', 'Abrir aulas e horários');
    });

    function renderReservations() {
        const reservationIds = new Set(aulasReservadas.map(item => item.id));
        reserveButtons.forEach(button => {
            const reserved = reservationIds.has(button.dataset.id);
            button.classList.toggle('btn-black', reserved);
            button.classList.toggle('btn-primary', !reserved);
            setButtonContent(
                button,
                reserved ? 'Cancelar reserva' : 'Reservar',
                reserved ? 'icon-presenca.png' : 'icon-aulas.png',
                reserved ? 'Cancelar reserva desta aula' : `Reservar ${button.dataset.name || 'aula'}`
            );
            button.setAttribute('aria-pressed', reserved ? 'true' : 'false');
        });

        const count = aulasReservadas.length;
        if (agendaCount) agendaCount.textContent = String(count);
        if (statReservadas) statReservadas.textContent = String(count);

        if (agendaList && agendaEmpty) {
            agendaList.replaceChildren();
            if (count === 0) {
                agendaEmpty.hidden = false;
                agendaList.append(agendaEmpty);
            } else {
                agendaEmpty.hidden = true;
                aulasReservadas.forEach(aula => {
                    const card = createElement('div', 'class-card');
                    const time = createElement('div', 'class-time', aula.time);
                    time.append(createElement('span', '', aula.date || 'Aula reservada'));
                    const info = createElement('div', 'class-info');
                    info.append(createElement('h4', '', aula.name));
                    info.append(createElement('p', 'class-tags', 'STATUS: CONFIRMADA'));
                    card.append(time, info);
                    agendaList.append(card);
                });
            }
        }

        if (upcomingContainer) {
            upcomingContainer.replaceChildren();
            if (count === 0) {
                upcomingContainer.append(createElement('p', '', 'Você ainda não reservou nenhuma aula.'));
                const viewClassesButton = createElement('button', 'btn btn-outline btn-go-horarios', 'Ver horários disponíveis');
                viewClassesButton.type = 'button';
                setButtonContent(viewClassesButton, 'Ver horários disponíveis', 'icon-aulas.png', 'Abrir aulas e horários');
                upcomingContainer.append(viewClassesButton);
            } else {
                const list = createElement('ul', 'grade-list');
                aulasReservadas.forEach(aula => {
                    const item = createElement('li', 'grade-item');
                    item.append(createElement('strong', '', aula.time), document.createTextNode(` ${aula.name}`));
                    list.append(item);
                });
                upcomingContainer.append(list);
            }
        }

        try {
            localStorage.setItem(storageKey, JSON.stringify(aulasReservadas));
        } catch {
            showToast('Reserva atualizada nesta sessão, mas não foi possível salvá-la no dispositivo.', 'warning');
        }
    }

    document.addEventListener('click', event => {
        const reserveButton = event.target.closest('.btn-reservar');
        if (reserveButton) {
            const aulaId = reserveButton.dataset.id;
            const existingIndex = aulasReservadas.findIndex(item => item.id === aulaId);

            if (existingIndex >= 0) {
                const [cancelled] = aulasReservadas.splice(existingIndex, 1);
                showToast(`Reserva cancelada: ${cancelled.name}.`, 'info');
            } else {
                const aula = {
                    id: aulaId,
                    name: reserveButton.dataset.name || 'Aula',
                    time: reserveButton.dataset.time || '',
                    date: selectedDate || ''
                };
                aulasReservadas.push(aula);
                showToast(`Reserva confirmada: ${aula.name}, às ${aula.time}.`);
            }

            renderReservations();
            return;
        }

        if (event.target.closest('.btn-go-horarios')) switchView('view-horarios');
    });

    updateClassFilters();
    renderReservations();
});