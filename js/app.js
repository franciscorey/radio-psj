// =========================================================================
// CONTROL DE VARIABLES GLOBAL SEGURO (Evita el SyntaxError de redeclaración)
// =========================================================================
if (typeof window.API_URL === 'undefined') {
    window.API_URL = 'https://script.google.com/macros/s/AKfycbzf2lQP_D3zWdRwBgYp8r6zzvaFO7rTKFwOEuOg5XZEHMwAkZhRkyoYKYOCcT4q4vUA/exec';
}

// Estados globales definidos de manera segura en el objeto window si no existen
window.appData = window.appData || {
    noticias: [],
    programas: [],
    programacion: [],
    informativos: [],
    anuncios: [],
    tv: null,
    ranking: []
};

// Variables de control de la SPA protegidas contra redeclaraciones
window.allNews = window.allNews || [];
let currentSection = 'inicio';
let currentArticleId = null;

let programasData = [];
let programacionData = [];
let scheduleData = [];

let currentNewsPage = 1;
const newsPerPage = 10;

const ZENO_CONFIG = {
    streamUrl: "https://stream.zeno.fm/lqnwrpclo7hvv",
    stationId: "lqnwrpclo7hvv",
    updateInterval: 15000
};

// =========================================================================
// ARRANQUE DE LA APLICACIÓN (DOM fully loaded)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {

    // Usamos una constante interna local para no colisionar con scripts externos
    const LOCAL_API_URL = window.API_URL;

    // ---------------------------------------------------------------------
    // 1. FUNCIÓN DE PRECARGA UNIFICADA DEFINITIVA
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

            // Poblamos el pool de memoria global
            window.appData.noticias = data.noticias || [];
            window.appData.programas = data.programas || [];
            window.appData.programacion = data.programacion || [];
            window.appData.informativos = data.informativos || [];
            window.appData.anuncios = data.anuncios || [];
            window.appData.tv = data.tv || null;
            window.appData.ranking = data.top10 || [];

            // Sincronizamos variables locales críticas para renderizados y grillas
            window.allNews = data.noticias || [];
            scheduleData = window.appData.programacion;
            programasData = data.programas || [];
            programacionData = data.programacion || [];

            // Dejamos la copia fresca en LocalStorage para blindar a sonando.js
            localStorage.setItem('sonando_cache', JSON.stringify({
                top10: data.top10 || [],
                nuevos: data.nuevos || []
            }));
            localStorage.setItem('sonando_cache_time', Date.now().toString());

            console.log("✅ Datos unificados sincronizados con éxito.");

            // 1. Procesamos el acoplamiento relacional de la grilla horaria inmediatamente
            mergeScheduleData();

            // 2. Renderizamos visualmente todos los componentes pasivos en la portada
            initInformativos();
            renderAnuncios();
            renderNeptunoTV();
            renderSchedule();

            // 3. Forzar actualización de widgets en tiempo real con la data cargada
            updateLiveSchedule();
            updateSonandoWidget(); // Carga la data del widget de ranking musical

            // 4. Carga de la data de resumen en la sección "Explora" de inicio
            const elNewsTitle = document.getElementById("explore-news-title");
            const elNewsImg = document.getElementById("explore-news-image");
            if (window.appData.noticias.length > 0) {
                const ultimaNoticia = window.appData.noticias[0];

                if (elNewsTitle) elNewsTitle.textContent = ultimaNoticia.titulo;
                if (elNewsImg && ultimaNoticia.imagen) {
                    // 🌟 DETECCIÓN INTELIGENTE DE URL PARA EL WIDGET EXPLORA
                    elNewsImg.src = /^https?:\/\//i.test(ultimaNoticia.imagen) ? ultimaNoticia.imagen : `assets/noticias/${ultimaNoticia.imagen}`;
                }
            }

            // Si el usuario ya está navegando en la grilla de noticias, la actualizamos en caliente
            if (currentSection === 'noticias') {
                renderNewsList();
            }

        } catch (error) {
            console.error("❌ Error en la precarga unificada:", error);

            // Fallback de emergencia: levantar el último localStorage guardado
            const backup = localStorage.getItem('sonando_cache');
            if (backup) {
                const cached = JSON.parse(backup);
                window.appData.ranking = cached.top10 || [];
                console.warn("⚠️ Operando con datos locales de emergencia desde caché.");

                // Intentar renderizar lo básico con caché
                updateSonandoWidget();
            }
        }
    }

    // Inicializador Maestro que coordina el arranque, estados de vista y temporizadores
    async function initData() {
        // RETOMADO: Asegurar que al arrancar en frío se muestre el Inicio completo con sus bloques activos
        showSection('inicio');

        // Ejecutar la descarga masiva de datos de la API
        await preloadData();

        // Renderizar la lista de noticias latente
        renderNewsList();

        // Temporizadores en segundo plano
        setInterval(updateLiveSchedule, 60000);
        setInterval(refreshBarraYTvTiempoReal, 60000);
        setInterval(refreshNoticiasTiempoReal, 300000);
    }

    // ---------------------------------------------------------------------
    // 2. SISTEMA DE NAVEGACIÓN SPA Y SECCIONES (RETOMADO Y COMPLETO)
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
        const tvSection = document.getElementById('neptuno-tv');
        const adsSection = document.getElementById('ads-section');
        const widgetsSection = document.getElementById('datos-widgets');

        if (sectionId === 'inicio') {
            if (aboutSection) aboutSection.classList.add('active');
            if (exploreSection) exploreSection.classList.add('active');
            if (tvSection) tvSection.classList.add('active');
            if (adsSection) adsSection.classList.add('active');
            if (widgetsSection) widgetsSection.classList.add('active');
        } else {
            if (aboutSection) aboutSection.classList.remove('active');
            if (exploreSection) exploreSection.classList.remove('active');
            if (tvSection) tvSection.classList.remove('active');
            if (adsSection) adsSection.classList.remove('active');
            if (widgetsSection) widgetsSection.classList.remove('active');
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

            if (sectionId === 'sonando' && typeof loadSonando === 'function') {
                loadSonando();
            }
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

            if (sectionId === 'sonando' && typeof loadSonando === 'function') {
                loadSonando();
            }
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
    // 3. REFRESH DE DATA EN SEGUNDO PLANO
    // ---------------------------------------------------------------------
    async function refreshNoticiasTiempoReal() {
        try {
            const cacheBuster = new Date().getTime();
            const response = await fetch(`${LOCAL_API_URL}?action=noticias&_cb=${cacheBuster}`);
            const data = await response.json();

            if (data.success && data.noticias) {
                window.appData.noticias = data.noticias;
                window.allNews = data.noticias;
                console.log("📰 Noticias actualizadas en tiempo real desde Sheets");

                if (currentSection === 'noticias') {
                    renderNewsList();
                }
            }
        } catch (error) {
            console.error("Error al refrescar noticias en segundo plano:", error);
        }
    }

    async function refreshBarraYTvTiempoReal() {
        try {
            const cacheBuster = new Date().getTime();

            const resInfo = await fetch(`${LOCAL_API_URL}?action=informativos&_cb=${cacheBuster}`);
            const dataInfo = await resInfo.json();
            if (dataInfo.success && dataInfo.informativos) {
                window.appData.informativos = dataInfo.informativos;
                initInformativos();
            }

            const resTv = await fetch(`${LOCAL_API_URL}?action=tv&_cb=${cacheBuster}`);
            const dataTv = await resTv.json();
            if (dataTv.success && dataTv.tv) {
                window.appData.tv = dataTv.tv;
                renderNeptunoTV();
                console.log("📺 Estado de la TV verificado");
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

        const actual = getCurrentProgram();
        if (actual) {
            mensajes.unshift({
                tipo: "AL AIRE",
                texto: actual.nombre || actual.programa
            });
        }

        const siguiente = getNextProgram();
        if (siguiente) {
            mensajes.push({
                tipo: "SIGUE",
                texto: siguiente.nombre || siguiente.programa
            });
        }

        mensajes.push({
            tipo: "TV",
            texto: "Neptuno TV transmite en vivo"
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
    // VISTA NEPTUNO TV
    // ==========================================
    function renderNeptunoTV() {
        const container = document.querySelector("#tv-player-container");
        if (!container) return;

        const tvConfig = window.appData.tv;

        if (!tvConfig) {
            container.innerHTML = `<video autoplay loop muted playsinline><source src="assets/tv-loop.mp4" type="video/mp4"></video>`;
            return;
        }

        if (tvConfig.activo && tvConfig.url_stream) {
            container.innerHTML = `<iframe src="${tvConfig.url_stream}" allowfullscreen></iframe>`;
        } else {
            const videoSrc = tvConfig.url_loop || "assets/tv-loop.mp4";
            container.innerHTML = `
                <video autoplay loop muted playsinline>
                    <source src="${videoSrc}" type="video/mp4">
                </video>
            `;
        }
    }

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
            // 🌟 DETECCIÓN INTELIGENTE DE URL PARA EL BACKGROUND-IMAGE
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

            // Cambiar únicamente el bloque de renderizado de imagen dentro de loadArticleDetail:
            if (article.imagen) {
                const img = document.createElement('img');

                // 🌟 DETECCIÓN INTELIGENTE DE URL PARA EL DETALLE
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
                    <h3>¿Quieres anunciarte en Radio Neptuno?</h3>
                    <p>Apoya nuestra señal independiente y llega a toda la comunidad local.</p>
                    <a href="mailto:avisoslegalesneptuno@gmail.com" class="btn-ad-dynamic">Escríbenos Hoy</a>
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

    // ==========================================
    // SISTEMA DE PROGRAMACIÓN DINÁMICA
    // ==========================================
    function mergeScheduleData() {
        const programasMap = {};
        programasData.forEach(p => { programasMap[p.id] = p; });
        scheduleData = programacionData.map(item => ({
            ...item,
            ...(programasMap[item.programa_id] || {})
        }));
    }

    function renderSchedule() {
        const container = document.querySelector('.schedule-grid');
        if (!container) return;

        container.innerHTML = scheduleData.map((item, index) => {
            // 🌟 APLICAMOS EL MISMO BLINDAJE VISUAL AQUÍ
            const nombre = item.nombre || item.programa || item.Programa || 'Programa Especial';
            const inicio = item.inicio || item.Hora_Inicio || item.inicio_hora || '--:--';
            const fin = item.fin || item.Hora_Fin || item.fin_hora || '--:--';
            const descripcion = item.descripcion || item.Descripcion || item.extracto || '';
            const icono = item.icono || item.Icono || 'fa-clock';

            return `
                <div class="schedule-card" data-index="${index}" data-start="${inicio}" data-end="${fin}">
                    <span class="time"><i class="fas ${icono}"></i> ${inicio} - ${fin}</span>
                    <h3>${nombre}</h3>
                    <p>${descripcion}</p>
                </div>
            `;
        }).join('');

        // 🌟 LA CLAVE: Forzar a que la tarjeta destacada "AL AIRE" se llene tras armar la grilla
        updateLiveSchedule();
    }

    function isCurrentProgram(currentMinutes, startMinutes, endMinutes) {
        if (endMinutes < startMinutes) {
            return (currentMinutes >= startMinutes || currentMinutes < endMinutes);
        }
        return (currentMinutes >= startMinutes && currentMinutes < endMinutes);
    }

    function getCurrentProgram() {
        if (!scheduleData || scheduleData.length === 0) return null;
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (let i = 0; i < scheduleData.length; i++) {
            const p = scheduleData[i];

            // 🌟 Blindaje adaptativo de propiedades horarias
            const horaInicio = p.inicio || p.Hora_Inicio || p.inicio_hora;
            const horaFin = p.fin || p.Hora_Fin || p.fin_hora;

            if (!horaInicio || !horaFin) continue;

            const [startHour, startMinute] = horaInicio.split(':').map(Number);
            const [endHour, endMinute] = horaFin.split(':').map(Number);

            if (isCurrentProgram(currentMinutes, startHour * 60 + startMinute, endHour * 60 + endMinute)) {
                return p;
            }
        }
        return null;
    }

    function getNextProgram() {
        if (!scheduleData || scheduleData.length === 0) return null;
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (let i = 0; i < scheduleData.length; i++) {
            const p = scheduleData[i];

            // 🌟 Blindaje adaptativo de propiedades horarias
            const horaInicio = p.inicio || p.Hora_Inicio || p.inicio_hora;
            const horaFin = p.fin || p.Hora_Fin || p.fin_hora;

            if (!horaInicio || !horaFin) continue;

            const [startHour, startMinute] = horaInicio.split(':').map(Number);
            const [endHour, endMinute] = horaFin.split(':').map(Number);

            if (isCurrentProgram(currentMinutes, startHour * 60 + startMinute, endHour * 60 + endMinute)) {
                return scheduleData[i + 1] || scheduleData[0];
            }
        }
        return null;
    }

    // =========================================================================
    // 1. WIDGET DE RESUMEN (RANKING MUSICAL) - CORREGIDO PROPIEDADES
    // =========================================================================
    function updateSonandoWidget() {
        if (!window.appData.ranking || window.appData.ranking.length === 0) return;

        // Ordenamos el ranking asegurando que lea 'votos' o 'Votos'
        const topTrack = [...window.appData.ranking].sort((a, b) => {
            const votosA = Number(a.votos || a.Votos || 0);
            const votosB = Number(b.votos || b.Votos || 0);
            return votosB - votosA;
        })[0];

        const textEl = document.getElementById("explore-top-track");
        const imgEl = document.getElementById("explore-top-cover");

        if (!topTrack) return;

        // Extraemos las variables soportando mayúsculas y minúsculas de Sheets
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

        console.log(`🎵 Widget Sonando actualizado con el #1 real: ${cancion}`);
    }

    // =========================================================================
    // 2. WIDGET REPRODUCTOR DE RADIO (CONEXIÓN NATIVA)
    // =========================================================================
    function updateWidgetSchedule(currentShow) {
        const widgetShowName = document.getElementById('widgetShowName');
        const widgetShowTime = document.getElementById('widgetShowTime');

        if (!widgetShowName || !widgetShowTime) return;

        if (currentShow) {
            const nombre = currentShow.nombre || currentShow.programa || currentShow.Programa || "Programa Especial";
            const inicio = currentShow.inicio || currentShow.Hora_Inicio || "--:--";
            const fin = currentShow.fin || currentShow.Hora_Fin || "--:--";

            widgetShowName.textContent = nombre;
            widgetShowTime.textContent = `${inicio} - ${fin}`;
        } else {
            widgetShowName.textContent = 'Sin programación';
            widgetShowTime.textContent = '--:-- - --:--';
        }
    }

    // =========================================================================
    // CONTROL MASTER DE PROGRAMA AL AIRE (GRILLA ORIGINAL + PORTADA + WIDGET)
    // =========================================================================

    function updateLiveSchedule() {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let currentShow = null;

        // 1. LÓGICA ORIGINAL RESTAURADA: Limpiar la grilla de programas
        document.querySelectorAll('.schedule-card').forEach(card => {
            card.classList.remove('current');
            const badge = card.querySelector('.current-badge');
            if (badge) badge.remove();
        });

        // 2. Buscar el programa actual e iluminar su tarjeta en la grilla
        if (scheduleData && scheduleData.length > 0) {
            scheduleData.forEach((programa, index) => {

                // Blindaje para soportar minúsculas o mayúsculas de Sheets
                const horaInicio = programa.inicio || programa.Hora_Inicio || "--:--";
                const horaFin = programa.fin || programa.Hora_Fin || "--:--";

                if (horaInicio === "--:--" || horaFin === "--:--") return;

                const [startHour, startMinute] = horaInicio.split(':').map(Number);
                const [endHour, endMinute] = horaFin.split(':').map(Number);

                const startMinutes = startHour * 60 + startMinute;
                const endMinutes = endHour * 60 + endMinute;

                const active = isCurrentProgram(currentMinutes, startMinutes, endMinutes);

                if (!active) return;

                // Si está al aire, lo guardamos y modificamos su tarjeta HTML
                currentShow = programa;

                const card = document.querySelectorAll('.schedule-card')[index];
                if (!card) return;

                card.classList.add('current');

                const badge = document.createElement('span');
                badge.className = 'current-badge';
                badge.textContent = 'Al Aire';
                card.appendChild(badge);
            });
        }

        // 3. ACTUALIZAR LA PORTADA (Sección Explora / Home)
        const elTitle = document.getElementById("explore-onair");
        const elTime = document.getElementById("explore-onair-time");
        const elDesc = document.getElementById("explore-onair-desc");

        if (currentShow) {
            const nombreShow = currentShow.nombre || currentShow.programa || currentShow.Programa || "Programa Especial";
            const hInicio = currentShow.inicio || currentShow.Hora_Inicio || "--:--";
            const hFin = currentShow.fin || currentShow.Hora_Fin || "--:--";
            const descShow = currentShow.descripcion || currentShow.extracto || currentShow.Descripcion || "Sintoniza nuestra señal en vivo.";

            if (elTitle) elTitle.textContent = nombreShow;
            if (elTime) elTime.textContent = `${hInicio} - ${hFin}`;
            if (elDesc) elDesc.textContent = descShow;
        } else {
            if (elTitle) elTitle.textContent = "Música de Continuidad";
            if (elTime) elTime.textContent = "--:-- - --:--";
            if (elDesc) elDesc.textContent = "Disfruta de la mejor selección musical de Neptuno.";
        }

        // 4. ACTUALIZAR EL REPRODUCTOR FLOTANTE
        updateWidgetSchedule(currentShow);
    }


    // =========================================================================
    // REPRODUCTOR AUDIO (ZENO RADIO) Y MENÚ RESPONSIVE
    // =========================================================================
    const menuToggle = document.getElementById('menuToggle');
    const mainNav = document.getElementById('mainNav');
    const audio = document.getElementById('zenoAudio');

    const radioWidget = document.getElementById('radio-widget');
    const widgetExpandBtn = document.getElementById('widgetExpandBtn');
    const widgetCollapseBtn = document.getElementById('widgetCollapseBtn');
    const widgetPlayBtn = document.getElementById('widgetPlayBtn');
    const widgetPlayIcon = document.getElementById('widgetPlayIcon');
    const widgetVolumeSlider = document.getElementById('widgetVolumeSlider');
    const widgetMuteBtn = document.getElementById('widgetMuteBtn');
    const widgetVolumeIcon = document.getElementById('widgetVolumeIcon');
    const widgetMiniStatus = document.getElementById('widgetMiniStatus');
    const widgetLiveBadge = document.getElementById('widgetLiveBadge');

    const widgetTrackTitle = document.getElementById('widgetTrackTitle');
    const widgetTrackArtist = document.getElementById('widgetTrackArtist');
    const widgetCover = document.getElementById('widgetCover');
    const widgetDefaultIcon = document.getElementById('widgetDefaultIcon');

    let isPlaying = false;
    let isMuted = false;
    let lastVolume = 0.8;
    let metadataTimer = null;

    if (audio) {
        audio.src = ZENO_CONFIG.streamUrl;
        audio.volume = lastVolume;
    }

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

    if (widgetExpandBtn && radioWidget) {
        widgetExpandBtn.addEventListener('click', () => {
            radioWidget.classList.remove('widget-minimized');
            radioWidget.classList.add('widget-expanded');
        });
    }

    if (widgetCollapseBtn && radioWidget) {
        widgetCollapseBtn.addEventListener('click', () => {
            radioWidget.classList.remove('widget-expanded');
            radioWidget.classList.add('widget-minimized');
        });
    }

    function alternarReproduccion() {
        if (!audio) return;
        if (!isPlaying) {
            if (widgetMiniStatus) widgetMiniStatus.textContent = "CONECTANDO...";
            audio.play()
                .then(() => {
                    isPlaying = true;
                    if (widgetPlayIcon) widgetPlayIcon.classList.replace('fa-play', 'fa-pause');
                    if (widgetMiniStatus) widgetMiniStatus.textContent = "ON";
                    if (widgetLiveBadge) widgetLiveBadge.style.display = 'inline-block';

                    fetchZenoMetadata();
                    metadataTimer = setInterval(fetchZenoMetadata, ZENO_CONFIG.updateInterval);
                })
                .catch(error => {
                    console.error("Error al reproducir el stream:", error);
                    if (widgetMiniStatus) widgetMiniStatus.textContent = "ERROR";
                });
        } else {
            audio.pause();
            audio.load();
            isPlaying = false;
            if (widgetPlayIcon) widgetPlayIcon.classList.replace('fa-pause', 'fa-play');
            if (widgetMiniStatus) widgetMiniStatus.textContent = "OFF";
            if (widgetLiveBadge) widgetLiveBadge.style.display = 'none';

            clearInterval(metadataTimer);
            resetMetadataUI();
        }
    }

    if (widgetPlayBtn) widgetPlayBtn.addEventListener('click', alternarReproduccion);

    const ctaEscucharAhora = document.getElementById('ctaEscucharAhora');
    if (ctaEscucharAhora && radioWidget) {
        ctaEscucharAhora.addEventListener('click', (e) => {
            e.preventDefault();
            if (radioWidget.classList.contains('widget-minimized')) {
                radioWidget.classList.remove('widget-minimized');
                radioWidget.classList.add('widget-expanded');
            }
            if (!isPlaying) alternarReproduccion();
        });
    }

    if (widgetVolumeSlider) {
        widgetVolumeSlider.addEventListener('input', (e) => {
            if (!audio) return;
            audio.volume = e.target.value;
            lastVolume = e.target.value;
            isMuted = (e.target.value == 0);
            updateVolumeIcon();
        });
    }

    if (widgetMuteBtn) {
        widgetMuteBtn.addEventListener('click', () => {
            if (!audio) return;
            if (isMuted) {
                audio.volume = lastVolume > 0 ? lastVolume : 0.8;
                if (widgetVolumeSlider) widgetVolumeSlider.value = audio.volume;
                isMuted = false;
            } else {
                lastVolume = audio.volume;
                audio.volume = 0;
                if (widgetVolumeSlider) widgetVolumeSlider.value = 0;
                isMuted = true;
            }
            updateVolumeIcon();
        });
    }

    function updateVolumeIcon() {
        if (!widgetVolumeIcon || !audio) return;
        widgetVolumeIcon.className = 'fas';
        if (isMuted || audio.volume === 0) {
            widgetVolumeIcon.classList.add('fa-volume-mute');
        } else if (audio.volume < 0.5) {
            widgetVolumeIcon.classList.add('fa-volume-down');
        } else {
            widgetVolumeIcon.classList.add('fa-volume-up');
        }
    }

    if (audio) {
        audio.addEventListener('waiting', () => { if (isPlaying && widgetMiniStatus) widgetMiniStatus.textContent = "SINC..."; });
        audio.addEventListener('playing', () => { if (isPlaying && widgetMiniStatus) widgetMiniStatus.textContent = "ON"; });
        audio.addEventListener('error', () => { if (widgetMiniStatus) widgetMiniStatus.textContent = "ERROR"; });
    }

    // ==========================================
    // EXTRAER METADATOS DE TRANSMISIÓN
    // ==========================================
    function fetchZenoMetadata() {
        if (!ZENO_CONFIG.stationId || ZENO_CONFIG.stationId === "") return;
        const zenoApiUrl = `https://api.zeno.fm/public/v2/store/station/${ZENO_CONFIG.stationId}/current-track`;

        fetch(zenoApiUrl)
            .then(res => { if (!res.ok) throw new Error(); return res.json(); })
            .then(data => {
                if (data && (data.title || data.artist)) {
                    const songTitle = data.title || "Radio Neptuno";
                    const songArtist = data.artist || "Señal Online";

                    if (widgetTrackTitle && (widgetTrackTitle.textContent !== songTitle || widgetTrackArtist.textContent !== songArtist)) {
                        widgetTrackTitle.textContent = songTitle;
                        if (widgetTrackArtist) widgetTrackArtist.textContent = songArtist;
                        fetchAlbumArt(songArtist, songTitle);
                    }
                }
            })
            .catch(() => console.warn("Metadatos Zeno no disponibles de forma temporal."));
    }

    function fetchAlbumArt(artist, title) {
        const query = encodeURIComponent(`${artist} ${title}`);
        const deezerUrl = `https://api.deezer.com/search?q=${query}&limit=1&output=jsonp`;
        const scriptId = 'deezer_jsonp_callback';
        const oldScript = document.getElementById(scriptId);
        if (oldScript) oldScript.remove();

        window.deezerCallback = (data) => {
            if (data && data.data && data.data.length > 0) {
                displayCover(data.data[0].album.cover_medium);
            } else {
                displayDefaultIcon();
            }
            delete window.deezerCallback;
        };

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `${deezerUrl}&callback=deezerCallback`;
        document.body.appendChild(script);
    }

    function displayCover(url) {
        if (widgetCover) { widgetCover.src = url; widgetCover.style.display = 'block'; }
        if (widgetDefaultIcon) widgetDefaultIcon.style.display = 'none';
    }

    function displayDefaultIcon() {
        if (widgetCover) widgetCover.style.display = 'none';
        if (widgetDefaultIcon) widgetDefaultIcon.style.display = 'block';
    }

    function resetMetadataUI() {
        if (widgetTrackTitle) widgetTrackTitle.textContent = "Radio Neptuno";
        if (widgetTrackArtist) widgetTrackArtist.textContent = "Señal Online";
        displayDefaultIcon();
    }

    // DISPARO INICIAL INTEGRAL
    initData();

});