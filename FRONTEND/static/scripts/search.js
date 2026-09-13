// Searching for the index.html

String.prototype.format = function (dict) {
    return this.replace(/{(\w+)}/g, (match, key) => {
        return typeof dict[key] !== 'undefined' ? dict[key] : match;
    });
};

// Get the search components first
const filter_type = document.getElementById("filter_type");
const options = document.getElementById('filter_otp');
const option_container = document.getElementById('op_cont');
const field_container = document.getElementById('field_cont');
const btn_search = document.getElementById('btn-search-filters');
const project_list = document.getElementById('projects-list');
const search_inp = document.getElementById('filter-search');

let state_op = 'hidden';


// Set up the network fields

const UNIQUE_URI = "http://localhost:3000/get_unique?field={field}";
const FILTER_URI = "http://localhost:3000/filter?field={field}&value={value}";
const FUZZY_URI = "http://localhost:3000/search_projects?query={query}";

/**
 * 
 * @param {Array} options - Give the list of values
 */
function change_options(op) {
    // Clean the old options
    options.replaceChildren();

    for (let index = 0; index < op.length; index++) {
        const element = op[index][0];

        const ele = document.createElement('option');
        ele.value = element;
        ele.innerText = element;

        options.appendChild(ele);

    }

}



// Changing the filter_type changes the option
filter_type.addEventListener('change', () => {

    option_container.style.visibility = 'hidden';


    // As the filter changed now change the options
    const uri = UNIQUE_URI.format({ field: filter_type.value });

    if (filter_type.value == "") {
        option_container.style.visibility = 'hidden';
        if (options.value != "All") {
            window.location.reload();
        }
    }


    option_container.style.visibility = "visible";

    // Fetch the content from the api to show
    fetch(uri)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            response.json().then((r) => {
                for (let index = 0; index < r.length; index++) {
                    // Now add them to the UI
                    change_options([["All"], ...r]);
                }
            }) // Returns a promise containing the parsed JSON
        })
        .then(data => {
            console.log(data);
        })

});

// Handle the options from the dropdown on search clicking
btn_search.addEventListener('click', () => {
    toggleProjectsSpinner(true);


    if (search_inp.value != "") {
        // We need to use fuzzy search or search by code
        if (search_inp.value.startsWith("@code")) {
            window.location.href = "/project.html?id="+search_inp.value.trim().toLowerCase().replace("@code:","");
        }

        else {

            const uri = FUZZY_URI.format({ "query": search_inp.value })
            project_list.replaceChildren();
            projectsState.loading = true;

            // We need to use fuzzy
            fetch(uri)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    response.json().then((r) => {



                        // Clean up the table
                        appendProjects(adaptProjectPage(r).items);
                        projectsState.hasMore = false;

                        // make loader invisible
                        projectsState.loaded = r['total'];
                        projectsState.total = r['total'];

                        updateProjectsCounter();
                        toggleProjectsSpinner(false);
                        projectsState.loading = false;



                    }) // Returns a promise containing the parsed JSON
                })
                .then(data => {
                    console.log(data);
                })

        }

        return;
    }

    const field = filter_type.value;
    const value = options.value;
    console.log(value);
    if (value == "All") {

        window.location.reload();
    }

    const uri = FILTER_URI.format({ "field": field, "value": value });

    // Now fetch the data

    fetch(uri)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            response.json().then((r) => {

                // Clean up the table
                project_list.replaceChildren();
                appendProjects(adaptProjectPage(r).items);
                projectsState.hasMore = false;

                // make loader invisible
                projectsState.loaded = r['total'];
                projectsState.total = r['total'];

                updateProjectsCounter();
                toggleProjectsSpinner(false);




            }) // Returns a promise containing the parsed JSON
        })
        .then(data => {
            console.log(data);
        })



})

// Hook change in text of the input
search_inp.addEventListener('input', () => {
    if (search_inp.value != "") {


        field_container.style.visibility = 'hidden';
        option_container.style.visibility = 'hidden';
    }
    else {
        field_container.style.visibility = 'visible';

        if (filter_type.value != "") {
            option_container.style.visibility = 'visible';
        }

    }

});