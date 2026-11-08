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