(() => {
    // O Supabase devolve os dados do link; este script cuida do resto da novela.
    const apiBaseUrl = 'http://localhost:3001';
    const message = document.getElementById('confirmation-message');
    const link = document.getElementById('confirmation-link');
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const confirmationType = hash.get('type');
    const errorCode = hash.get('error_code');
    const errorDescription = hash.get('error_description');
    const passwordForm = document.getElementById('invite-password-form');

    // Mostra o erro e limpa o link para ele não ficar exposto na barra do navegador.
    function showFailure(text, canResend = false) {
        message.textContent = text;
        link.href = canResend ? 'login.html?reenviar=1' : 'login.html';
        link.textContent = canResend ? 'Voltar ao login e pedir outro link' : 'Voltar ao login';
        link.hidden = false;
        window.history.replaceState(null, '', window.location.pathname);
    }

    // Link vencido ou rejeitado? Nada de insistir: pede um novo e segue o baile.
    if (errorCode || hash.has('error')) {
        const isExpired = errorCode === 'otp_expired';
        showFailure(
            isExpired
                ? 'Este link expirou ou já foi usado. Volte ao login e solicite um novo e-mail de confirmação.'
                : errorDescription
                    ? `Não foi possível confirmar o e-mail: ${errorDescription.replace(/\+/g, ' ')}`
                    : 'Não foi possível confirmar o e-mail. Solicite um novo link e tente novamente.',
            true
        );
        return;
    }

    // Guarda a sessão que veio no link para validar a conta com o servidor.
    if (!accessToken || !refreshToken) {
        showFailure('O link não trouxe uma sessão válida. Solicite um novo e-mail de confirmação.', true);
        return;
    }

    try {
        sessionStorage.setItem('nocaute.accessToken', accessToken);
        sessionStorage.setItem('nocaute.refreshToken', refreshToken);
    } catch (error) {
        console.error('Não foi possível salvar a sessão após confirmar o e-mail.', error);
        showFailure('E-mail confirmado, mas este navegador não permitiu iniciar a sessão. Faça login normalmente.');
        return;
    }

    window.history.replaceState(null, '', window.location.pathname);

    // Confirma que a sessão é real antes de encaminhar a pessoa ao painel.
    fetch(`${apiBaseUrl}/api/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    }).then(async response => {
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Não foi possível validar a conta confirmada.');
        }
        return result;
    }).then(user => {
        const role = ['aluno', 'instrutor', 'admin'].includes(user.role) ? user.role : 'aluno';
        const fullName = user.fullName?.trim() || user.email?.split('@')[0] || role;
        try {
            sessionStorage.setItem('nocaute.currentUser', JSON.stringify({
                email: user.email,
                profile: role,
                firstName: fullName
            }));
        } catch (error) {
            console.warn('Não foi possível guardar os dados de exibição da sessão.', error);
        }

        if (confirmationType === 'invite') {
            // Convite de equipe pede uma senha nova; nada de senha padrão da firma.
            message.textContent = 'Convite confirmado. Defina uma senha para acessar o painel de instrutor.';
            passwordForm.hidden = false;
            passwordForm.addEventListener('submit', async event => {
                event.preventDefault();
                const password = document.getElementById('invite-password').value;
                const confirmation = document.getElementById('invite-password-confirm').value;
                if (password.length < 6) {
                    message.textContent = 'A senha deve ter ao menos 6 caracteres.';
                    return;
                }
                if (password !== confirmation) {
                    message.textContent = 'As senhas não conferem.';
                    return;
                }

                const submit = document.getElementById('invite-password-submit');
                submit.disabled = true;
                try {
                    const response = await fetch(`${apiBaseUrl}/api/auth/password`, {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ password })
                    });
                    const result = response.status === 204 ? null : await response.json();
                    if (!response.ok) throw new Error(result?.error || 'Não foi possível definir sua senha.');
                    message.textContent = 'Senha definida. Redirecionando para o painel...';
                    window.location.replace(role === 'admin' ? 'admin.html' : role === 'instrutor' ? 'instrutor.html' : 'aluno.html');
                } catch (error) {
                    console.error('Falha ao definir a senha do convite.', error);
                    message.textContent = error.message;
                    submit.disabled = false;
                }
            });
            return;
        }

        message.textContent = 'E-mail confirmado. Redirecionando...';
        window.location.replace(role === 'admin' ? 'admin.html' : role === 'instrutor' ? 'instrutor.html' : 'aluno.html');
    }).catch(error => {
        console.error('Falha ao validar a conta após confirmação.', error);
        try {
            sessionStorage.removeItem('nocaute.accessToken');
            sessionStorage.removeItem('nocaute.refreshToken');
        } catch (storageError) {
            console.warn('Não foi possível limpar os tokens após falha na confirmação.', storageError);
        }
        showFailure('E-mail confirmado, mas não foi possível validar sua sessão. Faça login para continuar.');
    });
})();
