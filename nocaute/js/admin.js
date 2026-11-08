/* ==========================================
   PAINEL DO ADMINISTRADOR (DASHBOARD)
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. CARREGAR DADOS DO USUÁRIO
    // Puxa o nome do administrador logado (salvo no sessionStorage durante o login)
    const sessionData = sessionStorage.getItem('nocaute.currentUser');
    if (sessionData) {
        try {
            const user = JSON.parse(sessionData);
            const userName = user.firstName || 'Administrador';
            
            const perfilNome = document.getElementById('perfil-nome');
            const boasVindasNome = document.getElementById('boas-vindas-nome');
            
            if (perfilNome) perfilNome.textContent = userName;
            if (boasVindasNome) boasVindasNome.textContent = userName;
        } catch (e) {
            console.error("Erro ao carregar dados do usuário.");
        }
    }

    // 2. NAVEGAÇÃO LATERAL (TROCA DE ABAS)
    // Seleciona todos os botões do menu que possuem 'data-target' e todas as seções visuais
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-target]');
    const viewSections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove a classe 'active' de todos os botões e oculta todas as seções
            navItems.forEach(nav => nav.classList.remove('active'));
            viewSections.forEach(section => section.classList.remove('active'));

            // Destaca o botão clicado
            item.classList.add('active');

            // Exibe a seção correspondente ao 'data-target' do botão
            const targetId = item.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                targetSection.classList.add('active');
            } else {
                console.warn(`Atenção: Seção '${targetId}' ainda não foi criada no HTML.`);
            }
        });
    });

    // 3. LOGOUT (SAIR)
    // Limpa os dados do usuário ao clicar em sair
    const btnLogout = document.querySelector('.btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            sessionStorage.removeItem('nocaute.currentUser');
        });
    }
});



/*ABA Relatórios*/
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

    // ==========================================
    // 1. Gráfico de Alunos por modalidade
    // ==========================================
    const canvasModalidade = document.getElementById('chartModalidade');
    if (canvasModalidade) {
        const ctxModalidade = canvasModalidade.getContext('2d');
        new Chart(ctxModalidade, {
            type: 'bar',
            data: {
                labels: ['Boxe', 'Muay', 'Jiu-Jítsu', 'Funcional', 'Kickboxing'],
                datasets: [{
                    data: [], // Gráfico vazio, esperando o Banco de Dados
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    legend: {
                        display: true, // Mostra a legenda neste gráfico
                        position: 'bottom',
                        align: 'start',
                        labels: {
                            usePointStyle: true, // Bolinhas na legenda
                            boxWidth: 8
                        }
                    }
                },
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
    }

   // ==========================================
    // 2. Gráfico de Frequência Semanal
    // ==========================================
    const canvasFrequencia = document.getElementById('graficoFrequencia');
    if (canvasFrequencia) {
        const ctxFrequencia = canvasFrequencia.getContext('2d');
        new Chart(ctxFrequencia, {
            type: 'bar',
            data: {
                labels: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
                datasets: [
                    {
                        label: 'Esperado',
                        data: [50, 65, 50, 60, 45, 30],
                        backgroundColor: '#3b82f6', // AZUL para o esperado
                        borderWidth: 0,
                        borderRadius: 4
                    },
                    {
                        label: 'Presenças Reais',
                        data: [45, 60, 48, 55, 42, 25],
                        backgroundColor: '#f87171', // VERMELHO para o real
                        borderWidth: 0,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                ...commonOptions,
                plugins: {
                    legend: {
                        display: true, // Mostra a legenda com as duas cores
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true, // Bolinhas na legenda
                            boxWidth: 8
                        }
                    }
                },
                scales: {
                    x: commonOptions.scales.x,
                    y: {
                        ...commonOptions.scales.y,
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// ==========================================
    // REDIRECIONAMENTO DOS ALUNOS AUSENTES - ABA RELATÓRIOS PARA ABA ALUNOS
    // ==========================================
    const itensAusencia = document.querySelectorAll('.ausencia-item');
    
    itensAusencia.forEach(item => {
        item.addEventListener('click', () => {
            // 1. Remove a classe 'active' de todas as seções
            document.querySelectorAll('.view-section').forEach(section => {
                section.classList.remove('active');
            });

            // 2. Remove a classe 'active' de todos os botões do menu
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(nav => {
                nav.classList.remove('active');
            });

            // 3. Ativa a seção de Alunos
            const abaAlunos = document.getElementById('view-alunos');
            if (abaAlunos) {
                abaAlunos.classList.add('active');
            }

            // 4. Destaca o botão "Alunos" no menu lateral para o administrador não se perder
            const botaoMenuAlunos = document.querySelector('.sidebar-nav .nav-item[data-target="view-alunos"]');
            if (botaoMenuAlunos) {
                botaoMenuAlunos.classList.add('active');
            }
        });
    });