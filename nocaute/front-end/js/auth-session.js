(() => {
    // Descobre qual painel abriu e pega os passes guardados neste navegador.
    const apiBaseUrl = 'http://localhost:3001';
    const currentPage = window.location.pathname.endsWith('/instrutor.html')
        ? 'instrutor'
        : window.location.pathname.endsWith('/admin.html')
            ? 'admin'
            : 'aluno';

    let accessToken;
    let refreshToken;
    try {
        accessToken = sessionStorage.getItem('nocaute.accessToken');
        refreshToken = sessionStorage.getItem('nocaute.refreshToken');
    } catch (error) {
        console.error('Não foi possível acessar a sessão do navegador.', error);
        window.location.replace('login.html?erro=validacao');
        return;
    }

    if (!accessToken) {
        window.location.replace('login.html');
        return;
    }

    // Pergunta ao servidor quem está usando a conta; nome salvo sozinho não vale crachá.
    async function getCurrentUser(token) {
        const response = await fetch(`${apiBaseUrl}/api/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || 'Não foi possível validar a sessão.');
            error.status = response.status;
            throw error;
        }
        return result;
    }

    // Se o passe venceu, tenta renovar sem mandar a pessoa fazer login de novo.
    async function refreshSession() {
        if (!refreshToken) throw new Error('Token de renovação não encontrado.');
        const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || 'A sessão expirou.');
            error.status = response.status;
            throw error;
        }
        accessToken = result.accessToken;
        refreshToken = result.refreshToken;
        sessionStorage.setItem('nocaute.accessToken', result.accessToken);
        sessionStorage.setItem('nocaute.refreshToken', result.refreshToken);
        return result.user;
    }

    // Confere o papel antes de mostrar o painel certo.
    getCurrentUser(accessToken).catch(async error => {
        if (error.status !== 401) throw error;
        return refreshSession();
    }).then(user => {
        const role = ['aluno', 'instrutor', 'admin'].includes(user.role) ? user.role : 'aluno';
        if (role !== currentPage) {
            const destination = {
                aluno: 'aluno.html',
                instrutor: 'instrutor.html',
                admin: 'admin.html'
            }[role];
            window.location.replace(destination);
            return;
        }

        const name = user.fullName?.trim() || user.email?.split('@')[0] || role;
        try {
            sessionStorage.setItem('nocaute.currentUser', JSON.stringify({
                email: user.email,
                profile: role,
                firstName: name
            }));
        } catch (error) {
            console.warn('Não foi possível guardar os dados de exibição da sessão.', error);
        }

        document.getElementById('perfil-nome')?.replaceChildren(document.createTextNode(name));
        document.getElementById('boas-vindas-nome')?.replaceChildren(document.createTextNode(name));
        document.body.classList.remove('auth-pending');
    }).catch(error => {
        console.error('Falha ao validar a sessão pela API.', error);
        try {
            sessionStorage.removeItem('nocaute.accessToken');
            sessionStorage.removeItem('nocaute.refreshToken');
            sessionStorage.removeItem('nocaute.currentUser');
        } catch (storageError) {
            console.warn('Não foi possível limpar os dados da sessão.', storageError);
        }
        window.location.replace(error.status === 401 ? 'login.html' : 'login.html?erro=validacao');
    });

    // Sair apaga os passes daqui e pede ao servidor para encerrar a sessão também.
    document.querySelector('.btn-logout')?.addEventListener('click', async event => {
        event.preventDefault();

        try {
            const response = await fetch(`${apiBaseUrl}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken })
            });
            if (!response.ok) {
                throw new Error(`Backend rejeitou o encerramento da sessão (HTTP ${response.status}).`);
            }
        } catch (error) {
            console.error('Não foi possível revogar a sessão no Supabase; encerrando localmente.', error);
        }

        try {
            sessionStorage.removeItem('nocaute.accessToken');
            sessionStorage.removeItem('nocaute.refreshToken');
            sessionStorage.removeItem('nocaute.currentUser');
        } catch (error) {
            console.error('Não foi possível encerrar a sessão neste navegador.', error);
            window.alert('Não foi possível sair agora. Tente novamente.');
            return;
        }
        window.location.replace('login.html');
    });
})();
