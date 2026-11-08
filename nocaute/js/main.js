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
        if (type === "aluno") {
            submitButton.textContent = "Entrar como Aluno";
        } else if (type === "instrutor") {
            submitButton.textContent = "Entrar como Instrutor";
        } else if (type === "admin") {
            submitButton.textContent = "Entrar como Admin";
        }

        submitButton.dataset.type = type;
    }
}


/* ==========================================
   FORMULÁRIO DE LOGIN
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Elementos de perfil
    const profileButtons = document.querySelectorAll('.profile-tabs .tab-btn');

    // Formulários e campos
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const btnSubmitLogin = document.getElementById('btnSubmitLogin');

    // Variável que guarda o perfil selecionado
    let currentProfile = 'aluno';

    function firstNameFromEmail(email) {
        const localPart = (email || '').trim().split('@')[0] || '';
        const name = localPart.split(/[._+-]/)[0].toLocaleLowerCase('pt-BR');
        
        if (name) {
            return name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1);
        }
        
        if (currentProfile === 'instrutor') return 'Instrutor';
        if (currentProfile === 'admin') return 'Admin';
        return 'Aluno';
    }

    function storeUserSession(email) {
        try {
            sessionStorage.setItem('nocaute.currentUser', JSON.stringify({
                email: email.trim(),
                profile: currentProfile,
                firstName: firstNameFromEmail(email)
            }));
        } catch {
            // Dashboards retain their role-based fallback if storage is unavailable.
        }
    }

    // 1. Alternar entre Aluno, Instrutor e Admin
    profileButtons.forEach(button => {
        button.addEventListener('click', () => {
            profileButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            currentProfile = button.getAttribute('data-type');
            
            if (currentProfile === 'aluno') {
                if (emailInput) emailInput.placeholder = 'aluno@nocaute.com';
                if (btnSubmitLogin) btnSubmitLogin.textContent = 'Entrar como aluno';
            } else if (currentProfile === 'instrutor') {
                if (emailInput) emailInput.placeholder = 'instrutor@nocaute.com';
                if (btnSubmitLogin) btnSubmitLogin.textContent = 'Entrar como instrutor';
            } else if (currentProfile === 'admin') {
                if (emailInput) emailInput.placeholder = 'admin@nocaute.com';
                if (btnSubmitLogin) btnSubmitLogin.textContent = 'Entrar como admin';
            }
        });
    });

    // 2. Submissão do Formulário de Login (Redirecionamento)
    if (loginForm) {
        loginForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const passwordInput = document.querySelector("#senha");
            const email = emailInput?.value.trim();
            const password = passwordInput?.value;

            if (!email || !password) {
                alert("Preencha o e-mail e a senha.");
                return;
            }

            storeUserSession(email);

            // Redireciona de acordo com o perfil atualmente ativo (currentProfile)
            if (currentProfile === "instrutor") {
                window.location.href = "instrutor.html";
            } else if (currentProfile === "admin") {
                window.location.href = "admin.html";
            } else {
                window.location.href = "aluno.html";
            }
        });
    }
});