function getStoredVotes() {
  const votes = new Map();
  const raw = getCookie(CONFIG.VOTES_COOKIE);
  if (!raw) return votes;
  raw.split("|").forEach((entry) => {
    const sep = entry.lastIndexOf(":");
    const vote = CODE_TO_VOTE[entry.slice(sep + 1)];
    if (sep > 0 && vote) {
      try {
        votes.set(decodeURIComponent(entry.slice(0, sep)), vote);
      } catch {
        /* skip malformed entry */
      }
    }
  });
  return votes;
}

function storeVote(projectId, vote) {
  const votes = getStoredVotes();
  votes.delete(projectId);
  if (vote) votes.set(projectId, vote);

  const entries = [...votes].map(([id, v]) => `${encodeURIComponent(id)}:${VOTE_TO_CODE[v]}`);
  while (entries.length && encodeURIComponent(entries.join("|")).length > MAX_VOTES_COOKIE_LENGTH) {
    entries.shift();
  }

  if (entries.length) setCookie(CONFIG.VOTES_COOKIE, entries.join("|"));
  else deleteCookie(CONFIG.VOTES_COOKIE);
}

function nextVote(current, clicked) {
  return current === clicked ? null : clicked;
}

const VOTE_CLASSES = {
  up:   { on: "btn-success", off: "btn-outline-success" },
  down: { on: "btn-danger",  off: "btn-outline-danger" },
};

async function initReviews(project) {
  const buttons = document.querySelectorAll("[data-vote]");
  let counts = project.reviews || { up: 0, down: 0 };
  let myVote = getStoredVotes().get(project.id) ?? null;

  try {
    const freshVotes = await api.getVotes(project.id);
    if (freshVotes) counts = freshVotes;
  } catch (error) {
    console.warn("Could not fetch fresh votes, defaulting to project details:", error);
  }

  const render = () => {
    setText("review-up-count", formatNumber(counts.up));
    setText("review-down-count", formatNumber(counts.down));
    buttons.forEach((button) => {
      const classes = VOTE_CLASSES[button.dataset.vote];
      const selected = button.dataset.vote === myVote;
      button.classList.toggle(classes.on, selected);
      button.classList.toggle(classes.off, !selected);
      button.classList.remove("active");
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  render();

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const newVote = nextVote(myVote, button.dataset.vote);

      buttons.forEach((b) => { b.disabled = true; });
      try {
        counts = await api.submitReview(project.id, myVote, newVote, counts);
        myVote = newVote;
        storeVote(project.id, newVote);
        render();
        setText("review-message", newVote ? "Your review has been saved." : "Your review has been removed.");
      } catch (error) {
        console.error("Failed to save review:", error);
        setText("review-message", "Couldn't save your review. Try again.");
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  });
}

// Show the reviews in the UI
async function initReviews(project) {
  const buttons = document.querySelectorAll("[data-vote]");
  let counts = project.reviews || { up: 0, down: 0 };
  let myVote = getStoredVotes().get(project.id) ?? null;

  try {
    const freshVotes = await api.getVotes(project.id);
    if (freshVotes) counts = freshVotes;
  } catch (error) {
    console.warn("Could not fetch fresh votes:", error);
  }

  const render = () => {
    setText("review-up-count", formatNumber(counts.up));
    setText("review-down-count", formatNumber(counts.down));
    buttons.forEach((button) => {
      const classes = button.dataset.vote === "up" 
        ? { on: "btn-success", off: "btn-outline-success" } 
        : { on: "btn-danger", off: "btn-outline-danger" };
      
      const selected = button.dataset.vote === myVote;
      button.classList.toggle(classes.on, selected);
      button.classList.toggle(classes.off, !selected);
      button.classList.remove("active");
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  
  render();


  // Show the change actions properly in the UI
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const newVote = myVote === button.dataset.vote ? null : button.dataset.vote;
      buttons.forEach((b) => { b.disabled = true; });
      
      try {
        counts = await api.submitReview(project.id, myVote, newVote, counts);
        myVote = newVote;
        storeVote(project.id, newVote);
        render();
        setText("review-message", newVote ? "Your review has been saved." : "Your review has been removed.");
      } catch (error) {
        console.error("Failed to save review:", error);
        setText("review-message", "Couldn't save your review. Try again.");
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  });
}