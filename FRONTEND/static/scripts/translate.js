// 1. The Core API Handler
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

async function translateText(englishText, targetLanguage) {
    try {
        const response = await fetch("http://localhost:5000/translate", {
            method: "POST",
            body: JSON.stringify({
                q: englishText,
                source: "en",
                target: targetLanguage,
                format: "text",
                alternatives: 0,
                api_key: ""
            }),
            headers: {
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        return data.translatedText;
    } catch (error) {
        console.error("Translation failed:", error);
        return englishText;
    }
}


// 2. The DOM Crawler
async function changeWebsiteLanguage(isdom = true) {
    const selectedLanguage =
        document.getElementById("languageSelector").value;

    if (selectedLanguage === "en" && isdom) {
        document.cookie = `lang=en; path=/`;
        window.location.reload();
        return;
    }

    if (isdom) {
        document.cookie = `lang=${selectedLanguage}; path=/`;
    }

    const elements = document.querySelectorAll(
        "p, i , h1, h2, h3, h4, h5, h6, li, span, label, button, a,dd,dt"
    );

    for (const element of elements) {

        if (element.textContent.trim().length === 0 || element.children.length)
            continue;

        // Save English source
        if (!element.dataset.english) {
            element.dataset.english = element.textContent.trim();
        }

        const englishText = element.dataset.english;

        // Already translated into this language
        if (element.dataset.language === selectedLanguage)
            continue;

        const translatedText =
            await translateText(englishText, selectedLanguage);

        if (translatedText) {
            element.textContent = translatedText;
            element.dataset.language = selectedLanguage;
        }
    }
}

// Keep checking for dynamically added DOM elements
setInterval(() => {
    changeWebsiteLanguage(false);
}, 1000);

window.onload = () => {

    // set the language to cookie
    const curr_lang = getCookie('lang');
    if (curr_lang !== null) {
        document.getElementById("languageSelector").value = curr_lang;

        // Trigger it initally
        changeWebsiteLanguage(false);

    }

}