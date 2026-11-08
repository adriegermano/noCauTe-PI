document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.view-section');
    const toastRegion = document.createElement('div');
    toastRegion.className = 'dashboard-toast-region';
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('aria-relevant', 'additions');
    document.body.append(toastRegion);

    let userName = 'Instrutor';
    try {
        const user = JSON.parse(sessionStorage.getItem('nocaute.currentUser') || 'null');
        if (user?.profile === 'instrutor' && user.firstName) userName = user.firstName;
    } catch {
        userName = 'Instrutor';
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

    function setButtonContent(button, label, iconFile, title) {
        const icon = document.createElement('img');
        icon.src = `img/svg/${iconFile}`;
        icon.alt = '';
        icon.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.textContent = label;
        button.classList.add('dashboard-icon-button');
        button.title = title;
        button.replaceChildren(icon, text);
    }

    function switchView(targetId) {
        const targetView = document.getElementById(targetId);
        if (!targetView) return;

        navItems.forEach(button => {
            const isActive = button.dataset.target === targetId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-current', isActive ? 'page' : 'false');
        });

        views.forEach(view => view.classList.toggle('active', view === targetView));
        window.scrollTo(0, 0);
    }

    navItems.forEach(item => {
        item.title = `Abrir ${item.textContent.trim()}`;
        item.addEventListener('click', () => switchView(item.dataset.target));
    });

    document.querySelectorAll('.btn-go-chamada').forEach(button => {
        setButtonContent(button, button.textContent.trim(), 'icon-presenca.png', 'Abrir chamada da turma');
    });

    const saveAttendanceButton = document.getElementById('btn-salvar-chamada');
    if (saveAttendanceButton) {
        setButtonContent(saveAttendanceButton, saveAttendanceButton.textContent.trim(), 'icon-presenca.png', 'Salvar os status da chamada');
    }

    document.querySelectorAll('#tabela-chamada .btn-chamada').forEach(button => {
        const studentName = button.closest('tr')?.cells[0]?.textContent.trim() || 'aluno';
        const statusLabel = button.dataset.status === 'presente' ? 'Marcar presença' : 'Marcar falta';
        button.title = `${statusLabel} de ${studentName}`;
        button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
    });

    document.addEventListener('click', event => {
        const goToAttendance = event.target.closest('.btn-go-chamada');
        if (goToAttendance) {
            switchView('view-presencas');
            return;
        }

        const attendanceButton = event.target.closest('.btn-chamada');
        if (!attendanceButton) return;

        const row = attendanceButton.closest('tr');
        row.querySelectorAll('.btn-chamada').forEach(button => {
            const isSelected = button === attendanceButton;
            button.classList.toggle('active', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
        row.classList.add('attendance-complete');
    });

    const btnSalvarChamada = document.getElementById('btn-salvar-chamada');
    if (btnSalvarChamada) {
        btnSalvarChamada.addEventListener('click', () => {
            const rows = [...document.querySelectorAll('#tabela-chamada tbody tr')];
            const pendingCount = rows.filter(row => !row.querySelector('.btn-chamada.active')).length;

            if (pendingCount > 0) {
                showToast(`Marque presença ou falta para os ${pendingCount} aluno(s) pendente(s).`, 'warning');
            } else {
                showToast('Chamada salva com sucesso.');
                switchView('view-dashboard');
            }
        });
    }

    document.querySelectorAll('.sidebar-nav .icon-sidebar').forEach(icon => {
        const label = icon.parentElement.textContent.trim();
        icon.title = `Seção: ${label}`;
    });
});


/*ABA RELATÓRIOS*/
if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Archivo', sans-serif";
    Chart.defaults.color = '#6b7280';

const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false } // Esconde a legenda padrão na maioria
    },
    scales: {
        x: {
            grid: { display: false }, // Sem linhas verticais
            border: { display: false }
        },
        y: {
            border: { display: false },
            grid: {
                color: '#f3f4f6', // Cor das linhas horizontais (claras)
                drawTicks: false,
            },
            ticks: {
                padding: 10
            }
        }
    }
};

// 1. Ocupação por turma (%)
const ctxOcupacao = document.getElementById('chartOcupacao').getContext('2d');
new Chart(ctxOcupacao, {
    type: 'bar', // Tipo de gráfico (pode mudar para 'line' se preferir)
    data: {
        labels: ['Boxe', 'Muay', 'Jiu-Jítsu', 'Funcional', 'Kickboxing'],
        datasets: [{
            data: [], // Gráfico vazio
            backgroundColor: '#ffc933' // Cor de preenchimento futuro
        }]
    },
    options: {
        ...commonOptions,
        scales: {
            ...commonOptions.scales,
            y: {
                ...commonOptions.scales.y,
                min: 0,
                max: 100,
                ticks: { stepSize: 25 }
            }
        }
    }
});

// 2. Presenças por dia da semana
// 1. Primeiro gráfico
const elPresencas1 = document.getElementById('chartPresencas1');
if (elPresencas1) {
    new Chart(elPresencas1.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
            datasets: [{ data: [], backgroundColor: '#ffc933' }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, min: 0, max: 60, ticks: { stepSize: 15 } }
            }
        }
    });
}

// 2. Segundo gráfico
const elPresencas2 = document.getElementById('chartPresencas2');
if (elPresencas2) {
    new Chart(elPresencas2.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
            datasets: [{ data: [], backgroundColor: '#ffc933' }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, min: 0, max: 60, ticks: { stepSize: 15 } }
            }
        }
    });
}


}
