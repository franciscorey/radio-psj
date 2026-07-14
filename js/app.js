// =========================================================================
// CONTROL DE VARIABLES GLOBAL SEGURO (Evita el SyntaxError de redeclaración)
// =========================================================================
if (typeof window.API_URL === 'undefined') {
    window.API_URL = 'https://script.google.com/macros/s/AKfycbzf2lQP_D3zWdRwBgYp8r6zzvaFO7rTKFwOEuOg5XZEHMwAkZhRkyoYKYOCcT4q4vUA/exec';
}

// Estados globales definidos de manera segura (Solo mantenemos lo dinámico: noticias y anuncios)
window.appData = window.appData || {
    noticias: [],
    informativos: [],
    anuncios: [],
    ranking: []
};

// Variables de control de la SPA protegidas contra redeclaraciones
window.allNews = window.allNews || [];
let currentSection = 'inicio';
let currentArticleId = null;

let currentNewsPage = 1;
const newsPerPage = 10;

// =========================================================================
// ARRANQUE DE LA APLICACIÓN (DOM fully loaded)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {

    const LOCAL_API_URL = window.API_URL;

    // ---------------------------------------------------------------------
    // 1. FUNCIÓN DE PRECARGA UNIFICADA (Optimizada para Noticias y Anuncios)
    // ---------------------------------------------------------------------
    async function preloadData() {
        try {
            console.log("📡 Conectando con el estudio central (Apps Script)...");

            // Único viaje masivo al servidor usando la URL segura
            const response = await fetch(`${LOCAL_API_URL}?action=all`);
            const data = await response.json();

            if (!data || !data.success) {
                throw new Error("La respuesta del servidor no es válida");
            }

            // Poblamos el pool de memoria global únicamente con los datos dinámicos requeridos
            window.appData.noticias = data.noticias || [];
            window.appData.informativos = data.informativos || [];
            window.appData.anuncios = data.anuncios || [];
            window.appData.ranking = data.top10 || [];

            // Sincronizamos variables locales críticas para noticias
            window.allNews = data.noticias || [];

            // Dejamos la copia fresca en LocalStorage
            localStorage.setItem('sonando_cache', JSON.stringify({
                top10: data.top10 || [],
                nuevos: data.nuevos || []
            }));
            localStorage.setItem('sonando_cache_time', Date.now().toString());

            console.log("✅ Datos dinámicos unificados sincronizados con éxito.");

            // 1. Renderizamos visualmente componentes dinámicos en la portada
            initInformativos();
            renderAnuncios();
            updateSonandoWidget(); // Carga la data del widget de ranking musical

            // 2. Procesamos el estado horario actual utilizando la grilla estática del HTML
            updateLiveSchedule();

            // 3. Carga de la data de resumen en la sección "Explora" de inicio
            const elNewsTitle = document.getElementById("explore-news-title");
            const elNewsImg = document.getElementById("explore-news-image");
            if (window.appData.noticias.length > 0) {
                const ultimaNoticia = window.appData.noticias[0];

                if (elNewsTitle) elNewsTitle.textContent = ultimaNoticia.titulo;
                if (elNewsImg && ultimaNoticia.imagen) {
                    elNewsImg.src = /^https?:\/\//i.test(ultimaNoticia.imagen) ? ultimaNoticia.imagen : `assets/noticias/${ultimaNoticia.imagen}`;
                }
            }

            // Si el usuario ya está navegando en la grilla de noticias, la actualizamos en caliente
            if (currentSection === 'noticias') {
                renderNewsList();
            }

        } catch (error) {
            console.error("❌ Error en la precarga unificada:", error);

            // Fallback de emergencia
            const backup = localStorage.getItem('sonando_cache');
            if (backup) {
                const cached = JSON.parse(backup);
                window.appData.ranking = cached.top10 || [];
                console.warn("⚠️ Operando con datos locales de emergencia desde caché.");
                updateSonandoWidget();
            }
        }
    }

    // Inicializador Maestro que coordina el arranque, estados de vista y temporizadores
    async function initData() {
        showSection('inicio');

        // Ejecutar la descarga masiva de datos dinámicos de la API
        await preloadData();

        // Renderizar la lista de noticias latente
        renderNewsList();

        // Temporizadores en segundo plano (refrescos de reloj y control de grilla horaria)
        setInterval(updateLiveSchedule, 30000); // Chequea horario de programas estáticos cada 30 segundos
        setInterval(refreshBarraTiempoReal, 60000);
        setInterval(refreshNoticiasTiempoReal, 300000);
    }

    // ---------------------------------------------------------------------
    // 2. SISTEMA DE NAVEGACIÓN SPA Y SECCIONES
    // ---------------------------------------------------------------------
    function showSection(sectionId, articleId = null) {
        document.querySelectorAll('.view-section').forEach(section => {
            section.classList.remove('active');
        });

        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
            currentSection = sectionId;
        }

        // Bloques subordinados del Inicio que deben prenderse y apagarse coordinadamente
        const aboutSection = document.getElementById('sobre-radio');
        const exploreSection = document.getElementById('explora');
        const adsSection = document.getElementById('ads-section');

        if (sectionId === 'inicio') {
            if (aboutSection) aboutSection.classList.add('active');
            if (exploreSection) exploreSection.classList.add('active');
            if (adsSection) adsSection.classList.add('active');
        } else {
            if (aboutSection) aboutSection.classList.remove('active');
            if (exploreSection) exploreSection.classList.remove('active');
            if (adsSection) adsSection.classList.remove('active');
        }

        updateNavActive(sectionId);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (sectionId === 'noticias') {
            currentNewsPage = 1;
            renderNewsList();
        }

        if (sectionId === 'noticia-detalle' && articleId !== null) {
            loadArticleDetail(articleId);
        }

        if (articleId !== null) {
            history.pushState({ section: sectionId, articleId: articleId }, '', `?view=${sectionId}&id=${articleId}`);
        } else {
            history.pushState({ section: sectionId }, '', `?view=${sectionId}`);
        }
    }

    window.showSection = showSection;

    function updateNavActive(sectionId) {
        document.querySelectorAll('.main-nav a').forEach(link => {
            link.classList.remove('active');
        });

        const navSectionId = sectionId === 'noticia-detalle' ? 'noticias' : sectionId;
        const activeLink = document.querySelector(`.main-nav a[data-section="${navSectionId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }

    document.querySelectorAll('.main-nav a[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute('data-section');
            showSection(sectionId);
        });
    });

    document.querySelectorAll('.explore-card[data-section]').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = card.getAttribute('data-section');
            showSection(sectionId);
        });
    });

    document.querySelectorAll('.footer-links a[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute('data-section');
            showSection(sectionId);
        });
    });

    const logoLink = document.querySelector('.logo a');
    if (logoLink) {
        logoLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('inicio');
        });
    }

    window.addEventListener('popstate', (e) => {
        if (e.state) {
            const { section, articleId } = e.state;
            showSection(section, articleId);
        } else {
            showSection('inicio');
        }
    });

    // ---------------------------------------------------------------------
    // 3. REFRESH DE DATA EN SEGUNDO PLANO (Solo Noticias e Informativos)
    // ---------------------------------------------------------------------
    async function refreshNoticiasTiempoReal() {
        try {
            const cacheBuster = new Date().getTime();
            const response = await fetch(`${LOCAL_API_URL}?action=noticias&_cb=${cacheBuster}`);
            const data = await response.json();

            if (data.success && data.noticias) {
                window.appData.noticias = data.noticias;
                window.allNews = data.noticias;
                console.log("📰 Noticias actualizadas en tiempo real.");

                if (currentSection === 'noticias') {
                    renderNewsList();
                }
            }
        } catch (error) {
            console.error("Error al refrescar noticias en segundo plano:", error);
        }
    }

    async function refreshBarraTiempoReal() {
        try {
            const cacheBuster = new Date().getTime();

            const resInfo = await fetch(`${LOCAL_API_URL}?action=informativos&_cb=${cacheBuster}`);
            const dataInfo = await resInfo.json();
            if (dataInfo.success && dataInfo.informativos) {
                window.appData.informativos = dataInfo.informativos;
                initInformativos();
                console.log("🔔 Barra informativa actualizada.");
            }
        } catch (error) {
            console.error("Error al refrescar barra de información:", error);
        }
    }

    // ======================================
    // BARRA INFORMATIVA (MARQUESINA)
    // ======================================
    function initInformativos() {
        const track = document.getElementById("signal-track");
        if (!track) return;

        let mensajes = [];

        // Mensajes dinámicos cargados desde el sheet
        const informativos = window.appData.informativos.filter(item => item.activo === true);
        informativos.forEach(item => {
            if (item.texto) {
                mensajes.push({
                    tipo: item.nombre || "INFO",
                    texto: item.texto
                });
            }
        });

        if (window.appData.ranking && window.appData.ranking.length) {
            const top = window.appData.ranking[0];
            mensajes.unshift({
                tipo: "SONANDO",
                texto: `${top.artista} - ${top.cancion} lidera con ${top.votos} votos`
            });
        }

        // Obtener programas desde los elementos estáticos de la vista HTML
        const actual = getCurrentProgramFromHTML();
        if (actual) {
            mensajes.unshift({
                tipo: "AL AIRE",
                texto: actual.nombre
            });
        }

        const siguiente = getNextProgramFromHTML();
        if (siguiente) {
            mensajes.push({
                tipo: "SIGUE",
                texto: siguiente.nombre
            });
        }

        mensajes.push({
            tipo: "WEB",
            texto: "RADIO PSJ Transmite online "
        });

        const contenidoHTML = mensajes.map(msg => `
            <span class="signal-item">
                <span class="signal-badge" data-type="${msg.tipo}">${msg.tipo}</span>
                ${msg.texto}
            </span>
            <span class="signal-separator">●</span>
        `).join('');

        track.innerHTML = contenidoHTML + contenidoHTML;
    }

    function updateDateTime() {
        const now = new Date();
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        const fecha = `${dias[now.getDay()]} ${now.getDate()}, ${meses[now.getMonth()]} ${now.getFullYear()}`;
        const hora = now.toLocaleTimeString('es-CL', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });

        const dateEl = document.getElementById('current-date');
        const timeEl = document.getElementById('current-time');
        if (dateEl) dateEl.textContent = fecha;
        if (timeEl) timeEl.textContent = hora;
    }

    updateDateTime();
    setInterval(updateDateTime, 1000);

    // ==========================================
    // SISTEMA DE NOTICIAS CON PAGINACIÓN
    // ==========================================
    function renderNewsList() {
        const newsGrid = document.getElementById('newsGrid');
        const paginationContainer = document.getElementById('news-pagination');

        if (!newsGrid) return;

        if (window.allNews.length === 0) {
            newsGrid.innerHTML = '<p class="no-data">No hay noticias disponibles en este momento.</p>';
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        const startIndex = (currentNewsPage - 1) * newsPerPage;
        const endIndex = startIndex + newsPerPage;
        const noticiasPagina = window.allNews.slice(startIndex, endIndex);

        newsGrid.innerHTML = noticiasPagina.map(news => {
            let rutaImagen = "";
            if (news.imagen) {
                rutaImagen = /^https?:\/\//i.test(news.imagen) ? news.imagen : `assets/noticias/${news.imagen}`;
            }

            const bgStyle = news.imagen ? `style="background-image: url('${rutaImagen}'); background-size: cover; background-position: center;"` : 'style="background-color: var(--border-color); display: flex; align-items: center; justify-content: center;"';
            const fechaArticulo = news.fecha || news.Fecha || news.FECHA || '';

            return `
                <article class="news-card" data-id="${news.id}">
                    <div class="news-img-placeholder" ${bgStyle}>
                        ${!news.imagen ? '<i class="far fa-newspaper" style="font-size: 2.5rem; color: var(--text-muted);"></i>' : ''}
                    </div>
                    <div class="news-body">
                        <span class="news-tag">${news.categoria || 'General'}</span>
                        ${fechaArticulo ? `<div class="news-date"><i class="far fa-calendar-alt"></i> ${fechaArticulo}</div>` : ''}
                        <h3>${news.titulo || 'Sin Título'}</h3>
                        <p>${news.extracto || ''}</p>
                        <a href="#" class="news-link" onclick="event.preventDefault(); showSection('noticia-detalle', ${news.id});">
                            Leer artículo completo <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                </article>
            `;
        }).join('');

        if (paginationContainer) {
            const totalPages = Math.ceil(window.allNews.length / newsPerPage);
            if (totalPages <= 1) {
                paginationContainer.innerHTML = '';
                return;
            }

            let htmlBotones = [];
            htmlBotones.push(`
                <button class="pagination-btn" ${currentNewsPage === 1 ? 'disabled' : ''} onclick="event.preventDefault(); changeNewsPage(${currentNewsPage - 1})">
                    <i class="fas fa-chevron-left"></i>
                </button>
            `);

            for (let i = 1; i <= totalPages; i++) {
                htmlBotones.push(`
                    <button class="pagination-btn ${currentNewsPage === i ? 'active' : ''}" onclick="event.preventDefault(); changeNewsPage(${i})">
                        ${i}
                    </button>
                `);
            }

            htmlBotones.push(`
                <button class="pagination-btn" ${currentNewsPage === totalPages ? 'disabled' : ''} onclick="event.preventDefault(); changeNewsPage(${currentNewsPage + 1})">
                    <i class="fas fa-chevron-right"></i>
                </button>
            `);

            paginationContainer.innerHTML = htmlBotones.join('');
        }
    }

    window.changeNewsPage = function (pageNumber) {
        currentNewsPage = pageNumber;
        renderNewsList();
        const grid = document.getElementById("newsGrid");
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    async function loadArticleDetail(articleId) {
        const articleRoot = document.getElementById('article-root');
        if (!articleRoot) return;

        articleRoot.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Cargando artículo...</p>';

        try {
            if (window.allNews.length === 0) { window.allNews = window.appData.noticias; }

            const article = window.allNews.find(item => item.id === articleId);
            currentArticleId = articleId;

            if (!article) {
                articleRoot.innerHTML = `
                    <nav class="breadcrumb"><a href="#" onclick="event.preventDefault(); showSection('noticias');">← Volver a Noticias</a></nav>
                    <p>No se encontró el artículo solicitado.</p>
                `;
                return;
            }

            const currentIndex = window.allNews.findIndex(item => item.id === articleId);
            const prevArticle = currentIndex > 0 ? window.allNews[currentIndex - 1] : null;
            const nextArticle = currentIndex < window.allNews.length - 1 ? window.allNews[currentIndex + 1] : null;

            const formattedDate = new Date(article.fecha).toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            const currentUrl = encodeURIComponent(window.location.href);
            const encodedTitle = encodeURIComponent(article.titulo);

            const articleContainer = document.createElement('div');

            const breadcrumb = document.createElement('nav');
            breadcrumb.className = 'breadcrumb';
            const backLink = document.createElement('a');
            backLink.href = '#';
            backLink.textContent = '← Volver a Noticias';
            backLink.onclick = (e) => { e.preventDefault(); showSection('noticias'); };
            breadcrumb.appendChild(backLink);
            articleContainer.appendChild(breadcrumb);

            if (article.imagen) {
                const img = document.createElement('img');
                img.src = /^https?:\/\//i.test(article.imagen) ? article.imagen : `assets/noticias/${article.imagen}`;
                img.alt = article.titulo || 'Imagen';
                img.className = 'article-image';
                articleContainer.appendChild(img);
            }

            const header = document.createElement('div');
            header.className = 'article-header';

            const category = document.createElement('span');
            category.className = 'article-category';
            category.textContent = article.categoria || '';
            header.appendChild(category);

            const dateSpan = document.createElement('span');
            dateSpan.className = 'article-date';
            dateSpan.textContent = formattedDate;
            header.appendChild(dateSpan);

            const title = document.createElement('h1');
            title.className = 'article-title';
            title.textContent = article.titulo || '';
            header.appendChild(title);
            articleContainer.appendChild(header);

            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'article-body';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = article.cuerpo || '';

            tempDiv.querySelectorAll('script').forEach(script => script.remove());
            tempDiv.querySelectorAll('*').forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
                });
            });
            bodyDiv.innerHTML = tempDiv.innerHTML;
            articleContainer.appendChild(bodyDiv);

            const shareBlock = document.createElement('div');
            shareBlock.className = 'share-block';
            shareBlock.innerHTML = `<p>Compartir esta noticia:</p>`;

            const shareButtons = document.createElement('div');
            shareButtons.className = 'share-buttons';
            shareButtons.innerHTML = `
                <a href="https://twitter.com/intent/tweet?text=${encodedTitle}&url=${currentUrl}" class="btn-share twitter" target="_blank" rel="noopener noreferrer"><i class="fab fa-twitter"></i> Twitter</a>
                <a href="https://wa.me/?text=${encodedTitle}%20${currentUrl}" class="btn-share whatsapp" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp"></i> WhatsApp</a>
            `;
            shareBlock.appendChild(shareButtons);
            articleContainer.appendChild(shareBlock);

            const navDiv = document.createElement('div');
            navDiv.className = 'article-navigation';

            if (prevArticle) {
                const prevLink = document.createElement('a');
                prevLink.href = '#';
                prevLink.className = 'nav-article prev';
                prevLink.onclick = (e) => { e.preventDefault(); showSection('noticia-detalle', prevArticle.id); };
                prevLink.innerHTML = `<span class="nav-label">← Anterior</span><span class="nav-title">${prevArticle.titulo}</span>`;
                navDiv.appendChild(prevLink);
            } else {
                navDiv.appendChild(document.createElement('div'));
            }

            if (nextArticle) {
                const nextLink = document.createElement('a');
                nextLink.href = '#';
                nextLink.className = 'nav-article next';
                nextLink.onclick = (e) => { e.preventDefault(); showSection('noticia-detalle', nextArticle.id); };
                nextLink.innerHTML = `<span class="nav-label">Siguiente →</span><span class="nav-title">${nextArticle.titulo}</span>`;
                navDiv.appendChild(nextLink);
            }
            articleContainer.appendChild(navDiv);

            articleRoot.innerHTML = '';
            articleRoot.appendChild(articleContainer);
        } catch (error) {
            console.error('Error cargando artículo:', error);
        }
    }

    // ==========================================
    // SISTEMA DE ANUNCIOS INTERACTIVOS
    // ==========================================
    function renderAnuncios() {
        const container = document.querySelector("#ads-container");
        if (!container) return;

        const anuncios = window.appData.anuncios;

        if (!anuncios || anuncios.length === 0) {
            container.innerHTML = `
                <div class="ad-empty-state">
                    <h3>Anuncios próximamente</h3>
                    <p>Apoyamos a toda la comunidad.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = anuncios.map(ad => {
            const tieneImagen = ad.imagen && ad.imagen.trim() !== "";
            let urlFinal = ad.link ? ad.link.trim() : '#';
            if (urlFinal !== '#' && !/^https?:\/\//i.test(urlFinal)) {
                urlFinal = 'https://' + urlFinal;
            }

            return `
                <div class="ad-dynamic-card ${tieneImagen ? 'has-image' : ''}">
                    ${tieneImagen ? `
                        <div class="ad-reveal-bg">
                            <img src="${ad.imagen}" alt="${escapeHTML(ad.titulo)}" loading="lazy">
                        </div>
                    ` : ''}
                    <div class="ad-card-content">
                        <div class="ad-header-group">
                            <i class="fas ${ad.icono || 'fa-star'} ad-icon"></i>
                            <div class="ad-text-group">
                                <h3>${escapeHTML(ad.titulo)}</h3>
                                <p>${escapeHTML(ad.descripcion)}</p>
                            </div>
                        </div>
                    </div>
                    <a href="${urlFinal}" target="_blank" rel="noopener noreferrer" class="btn-ad-dynamic">
                        ${escapeHTML(ad.textoBoton || 'Saber más')}
                    </a>
                </div>
            `;
        }).join('');
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    // =========================================================================
    // LÓGICA DE DETECCIÓN INTELIGENTE DE HORARIOS DESDE EL HTML ESTÁTICO
    // =========================================================================
    function getStaticProgramsFromDOM() {
        const cards = document.querySelectorAll('.schedule-grid .schedule-card');
        const programs = [];

        cards.forEach((card, index) => {
            const startStr = card.getAttribute('data-start');
            const endStr = card.getAttribute('data-end');
            const nombre = card.querySelector('h3')?.textContent || 'Programa Especial';
            const descripcion = card.querySelector('p')?.textContent || '';
            const rawTimeRange = card.querySelector('.schedule-time')?.textContent || '';

            if (startStr && endStr) {
                programs.push({
                    index,
                    nombre,
                    descripcion,
                    inicio: startStr.trim(),
                    fin: endStr.trim(),
                    rawTimeRange,
                    element: card
                });
            }
        });
        return programs;
    }

    function isCurrentProgram(currentMinutes, startMinutes, endMinutes) {
        if (endMinutes < startMinutes) { // Soporte para programas que cruzan la medianoche
            return (currentMinutes >= startMinutes || currentMinutes < endMinutes);
        }
        return (currentMinutes >= startMinutes && currentMinutes < endMinutes);
    }

    function getCurrentProgramFromHTML() {
        const programs = getStaticProgramsFromDOM();
        if (programs.length === 0) return null;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (let i = 0; i < programs.length; i++) {
            const p = programs[i];
            const [startHour, startMinute] = p.inicio.split(':').map(Number);
            const [endHour, endMinute] = p.fin.split(':').map(Number);

            if (isCurrentProgram(currentMinutes, startHour * 60 + startMinute, endHour * 60 + endMinute)) {
                return p;
            }
        }
        return null;
    }

    function getNextProgramFromHTML() {
        const programs = getStaticProgramsFromDOM();
        if (programs.length === 0) return null;

        const current = getCurrentProgramFromHTML();
        if (!current) return programs[0]; // Si no hay nada al aire, sugerimos el primero de la grilla

        const nextIndex = (current.index + 1) % programs.length;
        return programs[nextIndex];
    }

    // =========================================================================
    // CONTROL MASTER DE PROGRAMA AL AIRE (GRILLA ESTÁTICA + PORTADA)
    // =========================================================================
    function updateLiveSchedule() {
        // 1. Limpiamos cualquier clase "current" o insignias previas en el DOM
        const cards = document.querySelectorAll('.schedule-grid .schedule-card');
        cards.forEach(card => {
            card.classList.remove('current');
            const badge = card.querySelector('.current-badge');
            if (badge) badge.remove();
        });

        // 2. Buscamos el programa que corresponde a esta hora
        const currentShow = getCurrentProgramFromHTML();

        if (currentShow) {
            // Marcamos visualmente su tarjeta en la grilla estática
            const activeCard = currentShow.element;
            if (activeCard) {
                activeCard.classList.add('current');
                const badge = document.createElement('span');
                badge.className = 'current-badge';
                badge.textContent = 'Al Aire';
                activeCard.appendChild(badge);
            }
        }

        // 3. Actualizamos la sección "Explora" en el Inicio
        const elTitle = document.getElementById("explore-onair");
        const elTime = document.getElementById("explore-onair-time");
        const elDesc = document.getElementById("explore-onair-desc");

        if (currentShow) {
            if (elTitle) elTitle.textContent = currentShow.nombre;
            if (elTime) elTime.textContent = currentShow.rawTimeRange || `${currentShow.inicio} - ${currentShow.fin}`;
            if (elDesc) elDesc.textContent = currentShow.descripcion;
        } else {
            if (elTitle) elTitle.textContent = "Música de Continuidad";
            if (elTime) elTime.textContent = "--:-- - --:--";
            if (elDesc) elDesc.textContent = "Disfruta de la mejor selección musical de Radio PSJ.";
        }
    }

    // =========================================================================
    // WIDGET DE RESUMEN (RANKING MUSICAL)
    // =========================================================================
    function updateSonandoWidget() {
        if (!window.appData.ranking || window.appData.ranking.length === 0) return;

        const topTrack = [...window.appData.ranking].sort((a, b) => {
            const votosA = Number(a.votos || a.Votos || 0);
            const votosB = Number(b.votos || b.Votos || 0);
            return votosB - votosA;
        })[0];

        const textEl = document.getElementById("explore-top-track");
        const imgEl = document.getElementById("explore-top-cover");

        if (!topTrack) return;

        const cancion = topTrack.cancion || topTrack.Cancion || topTrack.CANCION || 'Canción';
        const artista = topTrack.artista || topTrack.Artista || topTrack.ARTISTA || 'Artista';
        const votos = topTrack.votos || topTrack.Votos || topTrack.VOTOS || 0;
        const cover = topTrack.cover || topTrack.Cover || topTrack.COVER || 'default.webp';

        if (textEl) {
            textEl.innerHTML = `
                <strong>${cancion}</strong><br>
                <span>${artista}</span><br>
                <small>⚡ ${votos} impulsos</small>
            `;
        }

        if (imgEl) {
            imgEl.src = `assets/covers/${cover}`;
            imgEl.alt = `${cancion} - ${artista}`;
        }
    }

    // =========================================================================
    // MENÚ RESPONSIVE (MÓVIL)
    // =========================================================================
    const menuToggle = document.getElementById('menuToggle');
    const mainNav = document.getElementById('mainNav');

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', () => {
            mainNav.classList.toggle('open');
            const icon = menuToggle.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-times');
            menuToggle.setAttribute('aria-expanded', mainNav.classList.contains('open'));
        });

        mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    mainNav.classList.remove('open');
                    const icon = menuToggle.querySelector('i');
                    icon.classList.add('fa-bars');
                    icon.classList.remove('fa-times');
                    menuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }

    // DISPARO INICIAL INTEGRAL
    initData();

});