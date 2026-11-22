
/* ==========================================
   CARROSSEL PRINCIPAL
   CT FABIANO MINEIRO - NOCAUTE
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
    const carousel = document.querySelector("#heroCarousel");

    // Verifica se o carrossel existe na página
    if (!carousel) return;

    const slides = Array.from(
        carousel.querySelectorAll(".hero-slide")
    );

    const dots = Array.from(
        carousel.querySelectorAll(".hero-dot")
    );

    const previousButton = carousel.querySelector(".hero-prev");
    const nextButton = carousel.querySelector(".hero-next");

    // Não continua se não houver imagens
    if (slides.length === 0) return;

    // Define a imagem de fundo desfocada de cada slide
    slides.forEach((slide) => {
        const img = slide.querySelector("img");

        if (!img) return;

        const imageUrl = img.getAttribute("src");

        slide.style.setProperty(
            "--slide-background",
            `url("${imageUrl}") center / cover no-repeat`
        );
    });

    // Identifica o slide inicialmente ativo
    let currentIndex = slides.findIndex((slide) =>
        slide.classList.contains("active")
    );

    if (currentIndex < 0) {
        currentIndex = 0;
    }

    let autoplayId = null;
    const autoplayDelay = 6000;

    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    // Exibe o slide escolhido e atualiza os indicadores
    function showSlide(index) {
        currentIndex = (index + slides.length) % slides.length;

        slides.forEach((slide, i) => {
            const isActive = i === currentIndex;

            slide.classList.toggle("active", isActive);
            slide.setAttribute("aria-hidden", String(!isActive));
        });

        dots.forEach((dot, i) => {
            const isActive = i === currentIndex;

            dot.classList.toggle("active", isActive);
            dot.setAttribute("aria-current", String(isActive));
        });
    }

    // Avança para a próxima imagem
    function nextSlide() {
        showSlide(currentIndex + 1);
    }

    // Volta para a imagem anterior
    function previousSlide() {
        showSlide(currentIndex - 1);
    }

    // Interrompe a troca automática
    function stopAutoplay() {
        if (autoplayId !== null) {
            clearInterval(autoplayId);
            autoplayId = null;
        }
    }

    // Inicia a troca automática a cada 6 segundos
    function startAutoplay() {
        stopAutoplay();

        if (
            reducedMotion ||
            slides.length < 2 ||
            document.hidden
        ) {
            return;
        }

        autoplayId = setInterval(
            nextSlide,
            autoplayDelay
        );
    }

    // Permite selecionar uma imagem pelos indicadores
    dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
            showSlide(index);
            startAutoplay();
        });
    });

    // Botão de avançar
    if (nextButton) {
        nextButton.addEventListener("click", () => {
            nextSlide();
            startAutoplay();
        });
    }

    // Botão de voltar
    if (previousButton) {
        previousButton.addEventListener("click", () => {
            previousSlide();
            startAutoplay();
        });
    }

    // Pausa o carrossel quando o mouse estiver sobre ele
    carousel.addEventListener("mouseenter", stopAutoplay);
    carousel.addEventListener("mouseleave", startAutoplay);

    // Pausa enquanto o usuário navega pelos controles
    carousel.addEventListener("focusin", stopAutoplay);

    carousel.addEventListener("focusout", (event) => {
        if (!carousel.contains(event.relatedTarget)) {
            startAutoplay();
        }
    });

    // Pausa quando a aba do navegador fica oculta
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopAutoplay();
        } else {
            startAutoplay();
        }
    });

    // Inicializa o carrossel
    showSlide(currentIndex);
    startAutoplay();
});


/* ==========================================
   ALTERNÂNCIA DAS ABAS DE LOGIN
   ========================================== */

function switchTab(type) {
    const tabs = document.querySelectorAll(".tab-btn");
    const submitButton = document.querySelector(
        '.login-form button[type="submit"]'
    );

    tabs.forEach((tab) => {
        const isActive = tab.dataset.type === type;

        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    });

    if (submitButton) {
        submitButton.textContent =
            type === "aluno"
                ? "Entrar como Aluno"
                : "Entrar como Instrutor";

        submitButton.dataset.type = type;
    }
}


/* ==========================================
   FORMULÁRIO DE LOGIN E CADASTRO
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Elementos de perfil
    const profileButtons = document.querySelectorAll('.profile-tabs .tab-btn');

    // Botões de navegação dos formulários
    const btnGoToRegister = document.getElementById('btnGoToRegister');
    const btnGoToLogin = document.getElementById('btnGoToLogin');

    // Formulários e campos
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const emailInput = document.getElementById('email');
    const btnSubmitLogin = document.getElementById('btnSubmitLogin');
    const btnSubmitRegister = document.getElementById('btnSubmitRegister');
    const btnResendConfirmation = document.getElementById('btnResendConfirmation');

    // O servidor confere o perfil de verdade; escolher "Admin" aqui não dá superpoder.
    let currentProfile = 'aluno';
    const authMessage = document.getElementById('auth-message');
    const apiBaseUrl = 'http://localhost:3001';

    // Recados visíveis na tela, porque adivinhar o erro é uma péssima brincadeira.
    function showAuthMessage(message, type = 'error') {
        if (!authMessage) return;
        authMessage.textContent = message;
        authMessage.dataset.type = type;
        authMessage.hidden = false;
    }

    // Evita clique duplo enquanto o pedido está viajando para o servidor.
    function setFormBusy(form, busy) {
        form.querySelectorAll('button[type="submit"]').forEach(button => {
            button.disabled = busy;
        });
    }

    // Manda o pedido ao servidor e transforma resposta ruim em erro legível.
    async function postToApi(path, body) {
        const response = await fetch(`${apiBaseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok && response.status !== 202) {
            const error = new Error(result.error || 'A solicitação não foi concluída.');
            error.status = response.status;
            error.code = result.code;
            throw error;
        }
        return result;
    }

    // Guarda os passes da sessão; sem os dois, não tem entrada no painel.
    function saveSession(result) {
        if (!result.accessToken || !result.refreshToken) {
            showAuthMessage('O backend não retornou os dados da sessão. Tente novamente.');
            return false;
        }
        try {
            sessionStorage.setItem('nocaute.accessToken', result.accessToken);
            sessionStorage.setItem('nocaute.refreshToken', result.refreshToken);
            return true;
        } catch (error) {
            console.error('Não foi possível guardar a sessão no navegador.', error);
            showAuthMessage('Não foi possível iniciar a sessão neste navegador.');
            return false;
        }
    }

    const pageError = new URLSearchParams(window.location.search).get('erro');
    if (pageError === 'validacao') {
        showAuthMessage('Não foi possível verificar sua sessão. Confira sua conexão e tente novamente.');
    }
    if (new URLSearchParams(window.location.search).get('reenviar') === '1') {
        showAuthMessage('O link expirou ou já foi usado. Informe seu e-mail e solicite um novo link.');
        if (btnResendConfirmation) btnResendConfirmation.hidden = false;
    }

    // Atualiza os botões e fecha cadastro quando o perfil não pode se cadastrar sozinho.
    // 1. Alternar entre Aluno e Instrutor
    profileButtons.forEach(button => {
        button.addEventListener('click', () => {
            profileButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            currentProfile = button.getAttribute('data-type');

            if (currentProfile !== 'aluno' && registerForm?.style.display === 'block') {
                registerForm.style.display = 'none';
                if (loginForm) loginForm.style.display = 'block';
            }
            
            if (currentProfile === 'aluno') {
                if (emailInput) emailInput.placeholder = 'aluno@nocaute.com';
                if (btnSubmitLogin) btnSubmitLogin.textContent = 'Entrar como aluno';
                if (btnSubmitRegister) btnSubmitRegister.textContent = 'Criar conta como aluno';
                if (btnGoToRegister) btnGoToRegister.textContent = 'Criar conta';
            } else if (currentProfile === 'instrutor') {
                if (emailInput) emailInput.placeholder = 'instrutor@nocaute.com';
                if (btnSubmitLogin) btnSubmitLogin.textContent = 'Entrar como instrutor';
                if (btnSubmitRegister) {
                    btnSubmitRegister.textContent = 'Cadastro restrito a administradores';
                }
                if (btnGoToRegister) btnGoToRegister.textContent = 'Como obter acesso?';
            } else {
                if (emailInput) emailInput.placeholder = 'admin@nocaute.com';
                if (btnSubmitLogin) btnSubmitLogin.textContent = 'Entrar como administrador';
                if (btnSubmitRegister) btnSubmitRegister.textContent = 'Cadastro desativado';
                if (btnGoToRegister) btnGoToRegister.textContent = 'Acesso restrito';
            }

            if (currentProfile === 'aluno' && btnSubmitRegister) {
                btnSubmitRegister.textContent = 'Criar conta como aluno';
                btnSubmitRegister.disabled = false;
            } else if (btnSubmitRegister) {
                btnSubmitRegister.disabled = true;
            }
        });
    });

    // Senha certa e perfil certo: aí sim, cada um vai para seu painel.
    // 2. Login: valida as credenciais no Supabase antes de abrir o painel.
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            authMessage.hidden = true;

            const passwordInput = document.querySelector("#senha");
            const email = emailInput?.value.trim();
            const password = passwordInput?.value;

            if (!email || !password) {
                showAuthMessage("Preencha o e-mail e a senha.");
                return;
            }

            setFormBusy(loginForm, true);
            try {
                const result = await postToApi('/api/auth/login', {
                    email,
                    password,
                    expectedRole: currentProfile
                });
                if (!saveSession(result)) {
                    setFormBusy(loginForm, false);
                    return;
                }
                const destination = {
                    aluno: 'aluno.html',
                    instrutor: 'instrutor.html',
                    admin: 'admin.html'
                }[result.user.role];
                window.location.replace(destination || 'login.html');
            } catch (error) {
                console.error('Falha na solicitação de login à API.', error);
                if (error.code === 'email_not_confirmed') {
                    showAuthMessage(error.message);
                    if (btnResendConfirmation) {
                        btnResendConfirmation.dataset.email = email;
                        btnResendConfirmation.hidden = false;
                    }
                } else {
                    showAuthMessage(error.status ? error.message : 'Não foi possível conectar ao backend. Verifique se o servidor está rodando.');
                }
                setFormBusy(loginForm, false);
            }
        });
    }

    // Cadastro público cria aluno; instrutor e admin não brotam por conta própria.
    // 3. O cadastro público cria somente contas de aluno no backend.
    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            authMessage.hidden = true;

            if (currentProfile !== 'aluno') {
                showAuthMessage('Contas de instrutor precisam ser habilitadas por um administrador.');
                return;
            }

            const name = document.getElementById('reg-nome')?.value.trim();
            const email = document.getElementById('reg-email')?.value.trim();
            const password = document.getElementById('reg-senha')?.value;
            const confirmation = document.getElementById('reg-confirmar')?.value;

            if (!name || !email || !password || !confirmation) {
                showAuthMessage('Preencha todos os campos.');
                return;
            }
            if (password !== confirmation) {
                showAuthMessage('As senhas não conferem.');
                return;
            }

            setFormBusy(registerForm, true);
            try {
                const result = await postToApi('/api/auth/register', { name, email, password });
                if (result.confirmationRequired) {
                    showAuthMessage(result.message, 'success');
                    if (btnResendConfirmation) {
                        btnResendConfirmation.dataset.email = email;
                        btnResendConfirmation.hidden = false;
                    }
                    setFormBusy(registerForm, false);
                    document.getElementById('reg-nome').value = '';
                    document.getElementById('reg-senha').value = '';
                    document.getElementById('reg-confirmar').value = '';
                    return;
                }
                if (!saveSession(result)) {
                    setFormBusy(registerForm, false);
                    return;
                }
                window.location.replace('aluno.html');
            } catch (error) {
                console.error('Falha na solicitação de cadastro à API.', error);
                showAuthMessage(error.status ? error.message : 'Não foi possível conectar ao backend. Verifique se o servidor está rodando.');
                setFormBusy(registerForm, false);
            }
        });
    }

    // Link vencido? Pede outro sem fazer drama nem expor se a conta existe.
    btnResendConfirmation?.addEventListener('click', async () => {
        const email = btnResendConfirmation.dataset.email ||
            emailInput?.value.trim() ||
            document.getElementById('reg-email')?.value.trim();
        if (!email) {
            showAuthMessage('Informe o e-mail usado no cadastro antes de solicitar outro link.');
            emailInput?.focus();
            return;
        }

        btnResendConfirmation.disabled = true;
        try {
            const result = await postToApi('/api/auth/resend-confirmation', { email });
            showAuthMessage(result.message, 'success');
        } catch (error) {
            console.error('Falha ao solicitar novo e-mail de confirmação.', error);
            showAuthMessage(error.status ? error.message : 'Não foi possível conectar ao backend. Tente novamente.');
        } finally {
            btnResendConfirmation.disabled = false;
        }
    });

    // 4. Alternar para formulário de Cadastro
    if (btnGoToRegister) {
        btnGoToRegister.addEventListener('click', () => {
            if (currentProfile === 'instrutor') {
                showAuthMessage(
                    'O cadastro de instrutor é feito por convite no painel administrativo. Peça ao administrador para enviar um convite ao seu e-mail.'
                );
                return;
            }
            if (currentProfile === 'admin') {
                showAuthMessage('A criação de administradores é restrita. Solicite a configuração inicial ao responsável pelo sistema.');
                return;
            }
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'block';
        });
    }

    // 5. Alternar de volta para formulário de Login
    if (btnGoToLogin) {
        btnGoToLogin.addEventListener('click', () => {
            if (registerForm) registerForm.style.display = 'none';
            if (loginForm) loginForm.style.display = 'block';
        });
    }
});