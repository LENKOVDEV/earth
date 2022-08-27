
// Some constants
const EarthRadiusEquator = 6378.137;
const EarthRadiusPolar = 6356.752;
const EarthSkew = EarthRadiusPolar / EarthRadiusPolar; // 0.997; // earth skew
const HiddenCanvasSize = 4096;


const CONFIG = {
    loadTexture: true,
    updateBuffer: false,

    eyePosition: 20000,
    eyeLat: 52.37313,
    eyeLon: 4.89875,
    rotLatSpeed: 1,
    rotLatDir: 1,
    rotLonSpeed: 1,

    textureZoom: 3,
    vertexZoom: 5,
    // defaultURL: 'https://tile.osmand.net',
    defaultURL: 'https://tile.openstreetmap.org',
    
    drawMode: 'TRIANGLES',
    
    fieldOfView: (30 * Math.PI) / 180, // in radians
    zNear: 0.0001,
    zFar: 100
};

main();

// input: h in [0,360] and s,v in [0,1] - output: r,g,b in [0,1]
function hsv2rgb(h, s, v, a) {
    let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1), a];
}   

function getLatitudeFromTile(zoom, y) {
    let sign = y < 0 ? -1 : 1;
    return Math.atan(sign * Math.sinh(Math.PI * (1 - 2 * y / getPowZoom(zoom)))) * 180 / Math.PI;
}
function getLongitudeFromTile(zoom, x) {
    return x / getPowZoom(zoom) * 360.0 - 180.0;
}

function getPowZoom(zoom) {
    if (zoom >= 0 && zoom - Math.floor(zoom) < 0.001) {
        return 1 << parseInt(zoom);
    } else {
        return Math.pow(2, zoom);
    }
}

// Start here
function main() {
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    // If we don't have a GL context, give up now
    if (!gl) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    // Vertex shader program
    const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;
    attribute vec2 aTextureCoord;

    uniform mat4 uProjectionMatrix;
    uniform mat4 uRotationMatrix;
    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoord;

    void main(void) {
      gl_Position = uProjectionMatrix * uRotationMatrix * aVertexPosition;
      vColor = aVertexColor;
      vTextureCoord = aTextureCoord;
    }
  `;

    // Fragment shader program
    const fsSource = `
    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoord;
    uniform sampler2D uSampler;

    void main(void) {
    //   gl_FragColor = vColor; // random color 
       gl_FragColor = texture2D(uSampler, vTextureCoord); // tiles
    }
  `;

    // Initialize a shader program; this is where all the lighting
    // for the vertices and so forth is established.
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

    // Collect all the info needed to use the shader program.
    // Look up which attributes our shader program is using
    // for aVertexPosition, aVertexColor and also
    // look up uniform locations.
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            vertexColor: gl.getAttribLocation(shaderProgram, "aVertexColor"),
            textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
            rotationMatrix: gl.getUniformLocation(shaderProgram, "uRotationMatrix"),
            uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
        },
    };
    addListeners();
    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    var buffers = initBuffers(gl);
    // https://tile.openstreetmap.org/3/4/2.png
    // Browsers copy pixels from the loaded image in top-to-bottom order —
    // from the top-left corner; but WebGL wants the pixels in bottom-to-top
    // order — starting from the bottom-left corner. So in order to prevent
    // the resulting image texture from having the wrong orientation when
    // rendered, we need to make the following call, to cause the pixels to
    // be flipped into the bottom-to-top order that WebGL expects.

    
    var then = 0;
    // Draw the scene repeatedly
    var texture;
    function render(now) {
        if (CONFIG.updateBuffer) {
            buffers = initBuffers(gl);
            CONFIG.updateBuffer = false;
        }
        if (CONFIG.loadTexture) {
            texture = loadTexture(gl, CONFIG.defaultURL, CONFIG.textureZoom);
            // See jameshfisher.com/2020/10/22/why-is-my-webgl-texture-upside-down
            // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            CONFIG.loadTexture = false;
        }
        const deltaTime = now - then;
        then = now;
        drawScene(gl, programInfo, buffers, deltaTime / 1000.0, texture);
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

// Initialize the buffers we'll need.
function initBuffers(gl) {
    // Now set up the colors for the faces. We'll use solid colors
    // for each face.
    const z = CONFIG.vertexZoom;
    const sides = 1 << CONFIG.vertexZoom;
    const faceColors = [];
    for (var cind = 0; cind < sides * 2; cind++) {
        faceColors.push(hsv2rgb((360 / (sides * 2)) * cind, 0.9, 0.9, 1));
    }
    var ind = 0;
    var vertCount = 0;
    // Now create an array of positions for the cube.
    let colors = [];
    let positions = [];
    let indices = []
    let textureCoordinates = [];
    
    const rotAngle = 2 *  Math.PI / sides; // in radians
    const step = 1.0 / sides;
    for(var i = 0; i < sides; i++) {
        for (var j = 0; j < sides; j++) {
            // GEO: geolatitude = 90 - lat, geolongitude = lon - 180
            // const latt = EarthDelta + j * rotAngleLat;
            // const latb = EarthDelta + (j + 1) * rotAngleLat;
            // const lonl = i * rotAngle;
            // const lonr = (i + 1) * rotAngle;
            const latt = Math.PI / 2 - getLatitudeFromTile(z, j) / (180 / Math.PI);
            const latb = Math.PI / 2 - getLatitudeFromTile(z, j + 1) / (180 / Math.PI);
            const lonl = getLongitudeFromTile(z, i) / (180 / Math.PI) + Math.PI;
            const lonr = getLongitudeFromTile(z, i + 1) / (180 / Math.PI) + Math.PI;
            positions = positions.concat([
                Math.sin(lonl) * Math.sin(latt), EarthSkew * Math.cos(latt), Math.cos(lonl) * Math.sin(latt),
                Math.sin(lonl) * Math.sin(latb), EarthSkew * Math.cos(latb), Math.cos(lonl) * Math.sin(latb),
                Math.sin(lonr) * Math.sin(latt), EarthSkew * Math.cos(latt), Math.cos(lonr) * Math.sin(latt),
                Math.sin(lonr) * Math.sin(latb), EarthSkew * Math.cos(latb), Math.cos(lonr) * Math.sin(latb),
            ]);
            textureCoordinates = textureCoordinates.concat([
                // 0, 0, step * i, 0, step * i, step * j, 0, step * j,
                step * i, step * j, step * i, step * (j + 1), 
                step * (i + 1), step * j, step * (i + 1), step * (j + 1), 
                
                
            ]);
            indices = indices.concat([ind, ind + 1, ind + 2, ind + 2, ind + 1, ind + 3]);
            ind += 4;
            vertCount += 6;
            const c = faceColors[((i * sides + j) * 7) % faceColors.length];
            // Repeat each color four times for the four vertices of the face
            colors = colors.concat(c, c, c, c);
        }
    }
    // TOP and bottom TODO
    for (var j = -1; j <= 1; j += 2) {
        for (var i = 0; i < sides; i++) {
            var lonl = i * rotAngle;
            var lonr = (i + 1) * rotAngle;
            // let topAngle = EarthDelta;
            let topAngle = Math.PI / 2 - getLatitudeFromTile(z, 0) / (180 / Math.PI);
            positions = positions.concat([0, j * EarthSkew, 0,
                Math.sin(lonl) * Math.sin(topAngle), EarthSkew * j * Math.cos(topAngle), Math.cos(lonl) * Math.sin(topAngle),
                Math.sin(lonr) * Math.sin(topAngle), EarthSkew * j * Math.cos(topAngle), Math.cos(lonr) * Math.sin(topAngle)
            ]);
            indices = indices.concat([ind, ind + 1, ind + 2]);
            ind += 3;
            // Repeat each color 3 times for the four vertices of the face
            const c = [0.9, 0.9, 0.9, 0.9];
            colors = colors.concat(c, c, c);
            textureCoordinates = textureCoordinates.concat([0, 0, 0, 0, 0, 0, 0, 0]);
            vertCount += 3;
        }
    }
    
    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.

    // Create a buffer for the cube's vertex positions.
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

    // Build the element array buffer; this specifies the indices
    // into the vertex arrays for each face's vertices.
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    // Now send the element array to GL
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    

    return {
        verticesCount: vertCount,
        textureCoord: textureCoordBuffer,
        position: positionBuffer,
        color: colorBuffer,
        indices: indexBuffer,
    };
}

//
// Draw the scene.
//
function drawScene(gl, programInfo, buffers, deltaTime, texture) {
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clearDepth(1.0); // Clear everything
    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projectionMatrix = mat4.create();

    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
   // mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    const eye = vec3.fromValues(0, 0, - 1 - (CONFIG.eyePosition / EarthRadiusEquator));
    const lookAt = vec3.fromValues(0, 0, 0);
    const lookAtMatrix = mat4.create();
    const perspectiveMatrix = mat4.create();
    
    mat4.lookAt(lookAtMatrix, eye, lookAt, vec3.fromValues(0, 1, 0));
    mat4.perspective(perspectiveMatrix, CONFIG.fieldOfView, aspect, CONFIG.zNear, CONFIG.zFar);
    mat4.multiply(projectionMatrix, lookAtMatrix, projectionMatrix);
    mat4.multiply(projectionMatrix, perspectiveMatrix, projectionMatrix);

    const rotationMatrix = mat4.create();
    const zoomRotCoeef = CONFIG.eyePosition / 8000;
    CONFIG.eyeLon += deltaTime * CONFIG.rotLonSpeed * zoomRotCoeef;
    if (CONFIG.eyeLon > 180) {
        CONFIG.eyeLon -= 360;
    }
    CONFIG.eyeLat += CONFIG.rotLatDir * deltaTime * CONFIG.rotLatSpeed * zoomRotCoeef;
    if (CONFIG.rotLatSpeed > 0 || CONFIG.rotLonSpeed > 0) {
        updateText();
    }
    if (CONFIG.eyeLat >= 90) {
        CONFIG.eyeLat = 90;
        CONFIG.rotLatDir = -1;
    }
    if (CONFIG.eyeLat <= -90) {
        CONFIG.eyeLat = -90;
        CONFIG.rotLatDir = 1;
    }
    mat4.rotate(
        rotationMatrix, // destination matrix
        rotationMatrix, // matrix to rotate
        - CONFIG.eyeLat / (180 / Math.PI), // amount to rotate in radians
        [1, 0, 0]
    ); // axis to rotate around (X)

    mat4.rotate(
        rotationMatrix, // destination matrix
        rotationMatrix, // matrix to rotate
        - CONFIG.eyeLon / (180 / Math.PI), // amount to rotate in radians
        [0, 1, 0]
    ); // axis to rotate around (Z)

    // Tell WebGL how to pull out the positions from the position
    // buffer into the vertexPosition attribute
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    // Tell WebGL how to pull out the colors from the color buffer
    // into the vertexColor attribute.
    {
        const numComponents = 4;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexColor,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
    }

    // Tell WebGL how to pull out the texture coordinates from
    // the texture coordinate buffer into the textureCoord attribute.
    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
        gl.vertexAttribPointer(
            programInfo.attribLocations.textureCoord,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    }

    // Tell WebGL which indices to use to index the vertices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    // Tell WebGL to use our program when drawing
    gl.useProgram(programInfo.program);
    // Set the shader uniforms
    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.rotationMatrix, false, rotationMatrix);
    // Specify the textures
    // Tell WebGL we want to affect texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    // // Bind the texture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

    {
        const type = gl.UNSIGNED_SHORT;
        const offset = 0;
        gl.drawElements(gl[CONFIG.drawMode], buffers.verticesCount, type, offset);
    }
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(
            "Unable to initialize the shader program: " +
            gl.getProgramInfoLog(shaderProgram)
        );
        return null;
    }

    return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(
            "An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader)
        );
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function loadTexture(gl, url, zoom) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const hdcanvas = document.querySelector("#hiddencanvas");
    const ctx2D = hdcanvas.getContext("2d");
    
    // Because images have to be download over the internet
    // they might take a moment until they are ready.
    // Until then put a single pixel in the texture so we can
    // use it immediately. When the image has finished downloading
    // we'll update the texture with the contents of the image.
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType,pixel);
    let loadedImages = 0;
    const side = 1 << zoom;
    const scale = HiddenCanvasSize / (side);
    for(var x = 0; x < side; x++) {
        for (var y = 0; y < side; y++) {
            const xT = x;
            const yT = y;
            const image = new Image();
            image.onload = function () {
                ctx2D.drawImage(image, xT * scale, yT * scale, scale, scale);
                loadedImages = loadedImages + 1;
                if (loadedImages == side * side) {
                    gl.bindTexture(gl.TEXTURE_2D, texture);
                    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, hdcanvas);
                    // WebGL1 has different requirements for power of 2 images
                    // vs non power of 2 images so check if the image is a  power of 2 in both dimensions.
                    gl.generateMipmap(gl.TEXTURE_2D);
                    // No, it's not a power of 2. Turn off mips and set wrapping to clamp to edge
                    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                }
            };
            image.crossOrigin = "anonymous";
            image.src = url + "/" + zoom + "/" + x + "/" + y + ".png";
        }
    }   
    return texture;
}

function isPowerOf2(value) {
    return (value & (value - 1)) == 0;
}

function updateText() {
    var latText = document.getElementById('latText');
    var lonText = document.getElementById('lonText');
    latText.value = 'LAT: ' + CONFIG.eyeLat.toFixed(5);
    lonText.value = 'LON: ' + CONFIG.eyeLon.toFixed(5);
}

function registerSlider(idParam, uiPrefix, idInput, idLabel, flagParam) {
    var slider = document.getElementById(idInput);
    var sliderText = document.getElementById(idLabel);
    slider.value = CONFIG[idParam];
    sliderText.value = uiPrefix + CONFIG[idParam].toString();
    slider.addEventListener('input', function () {
        //slider.value = CONFIG[idParam].toString();
        CONFIG[idParam] = parseFloat(slider.value);
        if (flagParam) {
            CONFIG[flagParam] = true;
        }
        sliderText.value = uiPrefix + CONFIG[idParam].toString();
        // action can cause reevaluate
        // updateText();        
    });
    return slider;
}

function addListeners() {
    var drawMode = document.getElementById('drawMode');
    drawMode.addEventListener('change', function (e) { 
        CONFIG.drawMode = drawMode.options[drawMode.selectedIndex].value;
    });
    registerSlider('rotLonSpeed', 'ROT LON:', 'sliderRotLonSpeed', 'sliderRotLonSpeedText');
    registerSlider('rotLatSpeed', 'ROT LAT:', 'sliderRotLatSpeed', 'sliderRotLatSpeedText');

    let eyeZoom = registerSlider('eyePosition', 'CAM DIST km:', 'sliderEyePos', 'sliderEyePosText');
    eyeZoom.addEventListener('input', function () {
        if (CONFIG.eyePosition < 5000 && eyeZoom.step > 10) {
            eyeZoom.min = 10;
            eyeZoom.max = 10000;
            eyeZoom.step = 10;
            eyeZoom.value = 4000;
        }
        if (CONFIG.eyePosition >= 9000 && eyeZoom.step == 10) {
            eyeZoom.min = 4000;
            eyeZoom.max = 100000;
            eyeZoom.step = 1000;
            eyeZoom.value = 9000;
        }
    });

    registerSlider('zNear', 'zNear:', 'sliderZNear', 'sliderZNearText');
    registerSlider('zFar', 'zFar:', 'sliderZFar', 'sliderZFarText');

    registerSlider('vertexZoom', 'Vertex Zoom:', 'sliderZoom', 'sliderZoomText', 'updateBuffer');
    registerSlider('textureZoom', 'Tiles Zoom:', 'sliderTextureZoom', 'sliderTextureZoomText', 'loadTexture' );
    
    updateText();
}