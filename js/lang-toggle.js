window.addEventListener("load", function() {
    
    // 1. Récupérer la langue (en par défaut)
    var lang = localStorage.getItem('userLang') || 'en';
    
    // 2. Appliquer la langue au <html>
    document.documentElement.lang = lang;
    
    // 3. Mettre à jour le texte du bouton (Si c'est anglais, on affiche FR pour changer)
    var btn = document.getElementById('lang-toggle');
    
    if (btn) {
        btn.innerText = lang === 'en' ? 'FR' : 'EN';
        
        // 4. Attacher l'action au clic
        btn.onclick = function() {
            var currentLang = document.documentElement.lang;
            var newLang = currentLang === 'en' ? 'fr' : 'en';
            
            document.documentElement.lang = newLang;
            localStorage.setItem('userLang', newLang);
            
            btn.innerText = newLang === 'en' ? 'FR' : 'EN';
        };
    }
});


window.addEventListener('scroll', function() {
  var btn = document.getElementById("scrollTopBtn");
  if (btn) {
    if (document.documentElement.scrollTop > 300 || document.body.scrollTop > 300) {
      btn.style.display = "block";
    } else {
      btn.style.display = "none";
    }
  }
});


// ==========================================
// PREVIEW IMAGE AVEC ZOOM
// ==========================================
document.addEventListener('click', function(e) {
  const img = e.target.closest('img.zoomable');
  
  if (img) {
    
    const overlay = document.createElement('div');
    overlay.id = 'img-overlay';
    
    const bigImg = document.createElement('img');
    bigImg.src = img.src; // Utilise img au lieu de e.target pour être sûr du src
    bigImg.id = 'overlay-img';
    
    overlay.appendChild(bigImg);
    document.body.appendChild(overlay);
    
    document.body.style.overflow = 'hidden';
    
    overlay.addEventListener('click', function(event) {
      if (event.target.id === 'overlay-img') {
        bigImg.classList.toggle('zoomed');
      } else {
        document.body.removeChild(overlay);
        document.body.style.overflow = 'auto'; 
      }
    });
  }
});