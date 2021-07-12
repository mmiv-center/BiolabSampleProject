import * as THREE from './three.module.js';

import Stats from './stats.module.js';
import { GUI } from './dat.gui.module.js';

import { OrbitControls } from './OrbitControls.js';

function planesFromMesh( vertices, indices ) {
    
    // creates a clipping volume from a convex triangular mesh
    // specified by the arrays 'vertices' and 'indices'
    
    const n = indices.length / 3,
    result = new Array( n );
    
    for ( let i = 0, j = 0; i < n; ++ i, j += 3 ) {
        
        const a = vertices[ indices[ j ] ],
        b = vertices[ indices[ j + 1 ] ],
        c = vertices[ indices[ j + 2 ] ];
        
        result[ i ] = new THREE.Plane().
        setFromCoplanarPoints( a, b, c );
        
    }
    
    return result;
    
}

function createPlanes( n ) {
    
    // creates an array of n uninitialized plane objects
    
    const result = new Array( n );
    
    for ( let i = 0; i !== n; ++ i )
    result[ i ] = new THREE.Plane();
    
    return result;
    
}

function assignTransformedPlanes( planesOut, planesIn, matrix ) {
    
    // sets an array of existing planes to transformed 'planesIn'
    
    for ( let i = 0, n = planesIn.length; i !== n; ++ i )
    planesOut[ i ].copy( planesIn[ i ] ).applyMatrix4( matrix );
    
}

function cylindricalPlanes( n, innerRadius ) {
    
    const result = createPlanes( n );
    
    for ( let i = 0; i !== n; ++ i ) {
        
        const plane = result[ i ],
        angle = i * Math.PI * 2 / n;
        
        plane.normal.set( Math.cos( angle ), 0, Math.sin( angle ) ); 
        plane.constant = innerRadius;
        
    }
    
    return result;
    
}

const planeToMatrix = ( function () {
    
    // creates a matrix that aligns X/Y to a given plane
    
    // temporaries:
    const xAxis = new THREE.Vector3(),
    yAxis = new THREE.Vector3(),
    trans = new THREE.Vector3();
    
    return function planeToMatrix( plane ) {
        
        const zAxis = plane.normal,
        matrix = new THREE.Matrix4();
        
        // Hughes & Moeller '99
        // "Building an Orthonormal Basis from a Unit Vector."
        
        if ( Math.abs( zAxis.x ) > Math.abs( zAxis.z ) ) {
            yAxis.set( - zAxis.y, zAxis.x, 0 );  
        } else {
            yAxis.set( 0, - zAxis.z, zAxis.y );
        }
        
        xAxis.crossVectors( yAxis.normalize(), zAxis );
        
        plane.coplanarPoint( trans );
        return matrix.set(    xAxis.x, yAxis.x, zAxis.x, trans.x,          xAxis.y, yAxis.y, zAxis.y, trans.y,            xAxis.z, yAxis.z, zAxis.z, trans.z,            0,	 0, 0, 1 );            
    };
    
} )();


// A regular tetrahedron for the clipping volume:

const Vertices = [
    new THREE.Vector3( + 1, 0, + Math.SQRT1_2 ),
    new THREE.Vector3( - 1, 0, + Math.SQRT1_2 ),
    new THREE.Vector3( 0, + 1, - Math.SQRT1_2 ),
    new THREE.Vector3( 0, - 1, - Math.SQRT1_2 )
],

Indices = [
    0, 1, 2,	0, 2, 3,	0, 3, 1,	1, 3, 2
],

Planes = planesFromMesh( Vertices, Indices ),
PlaneMatrices = Planes.map( planeToMatrix ),

GlobalClippingPlanes = cylindricalPlanes( 5, 2.5 ),

Empty = Object.freeze( [] );
var objectsInWorld = []; // keep a list of all objects in the world so we can label them


function createPlateGeometry( plate, plate2, setup ) {
    objectsInWorld = []; 
    // add those to the scene as colored cubes
    var firstRow = plate.data[Object.keys(plate.data)[0]];
    var numWells = Object.keys(firstRow).length;
    var numRecords = Object.keys(plate.data).length;
    
    // we need to display two objects, from different plates
    // if we have that information in setup
    var firstPlateNumber = plate.plate_number;
    var secondPlate = plate2;
    
    // delete the old object!!
    object.remove(...object.children)
    
    object = new THREE.Group();
    
    const geometry = new THREE.BoxGeometry( 0.08, 0.08, 0.08 );
    var maxVal = 0;
    for ( let z = 0; z < numWells; ++ z ) {
        for ( let x = 0; x < numRecords; ++x ) {
            var ks = Object.keys(plate.data); // "1", ...
            var w = ks[x];
            var ks2 = Object.keys(firstRow);
            var v = ks2[z];
            var val = plate.data[w][v]; // 0..1?
            if (maxVal < val) maxVal = val;
        }
    }
    
    var shift = 0.042;
    if (plate2 == null)
    shift = 0;
    for ( let z = 0; z < numWells; ++ z ) {
        for ( let y = -6; y <= -6; ++ y ) { // one direction 
            for ( let x = 0; x < numRecords; ++x ) {
                var ks = Object.keys(plate.data); // "1", ...
                var w = ks[x];
                var ks2 = Object.keys(firstRow);
                var v = ks2[z];
                var val = plate.data[w][v]; // 0..1?
                var idx = Math.round((val/maxVal)*8);
                idx = Math.max(0,Math.min(8,idx));
                var col = colorbrewer["PuBu"][9][idx];
                if (typeof(col) == "undefined") console.log("no color found");
                
                var clipMaterial = new THREE.MeshPhongMaterial( {
                    color: col,
                    shininess: 10,
                    side: THREE.FrontSide, // THREE.DoubleSide,
                    // Clipping setup:
                    //clippingPlanes: createPlanes( Planes.length ),
                    clipShadows: false// true
                } );
                
                var val2height = val;
                const mesh = new THREE.Mesh( geometry, clipMaterial );
                mesh.position.set( (x-(numRecords/2)) / 5 + shift, (y+0) / 5 + val2height, (z-(numWells/2)) / 10 );
                objectsInWorld.push({ 'type': "box", 'plate': plate.plate_number, 'val': val, 'pos': mesh.position });
                mesh.castShadow = true;
                object.add( mesh );
            }
        }
    }
    if (plate2 != null) {
        for ( let z = 0; z < numWells; ++ z ) {
            for ( let y = -6; y <= -6; ++ y ) { // one direction 
                for ( let x = 0; x < numRecords; ++x ) {
                    var ks = Object.keys(plate2.data); // "1", ...
                    var w = ks[x];
                    var ks2 = Object.keys(firstRow);
                    var v = ks2[z];
                    var val = plate2.data[w][v]; // 0..1?
                    var idx = Math.round((val/maxVal)*8);
                    idx = Math.max(0,Math.min(8,idx));
                    var col = colorbrewer["PuBu"][9][idx];
                    if (typeof(col) == "undefined")
                    console.log("no color found");
                    
                    var clipMaterial = new THREE.MeshPhongMaterial( {
                        color: col,
                        shininess: 10,
                        side: THREE.FrontSide, // THREE.DoubleSide,
                        // Clipping setup:
                        //clippingPlanes: createPlanes( Planes.length ),
                        clipShadows: false// true
                    } );
                    
                    var val2height = val;
                    const mesh = new THREE.Mesh( geometry, clipMaterial );
                    mesh.position.set( (x-(numRecords/2)) / 5 - shift, (y+0) / 5 + val2height, (z-(numWells/2)) / 10 );
                    objectsInWorld.push({ 'type': "box", 'plate': plate2.plate_number, 'val': val, 'pos': mesh.position });
                    mesh.castShadow = true;
                    object.add( mesh );
                }
            }
        }
    }
    
    // lets plot a visual representation of the 50% mark for each pair of columns
    if  (typeof(setup['function_fits']) != 'undefined') {
        var geom = new THREE.BoxGeometry(1,1,0.01);
        var display_range = [(0-(numWells/2))/10, ((numWells-1)-(numWells/2))/10];
        var data_range = [
            Math.log2(Math.min(...Object.values(setup.concentration).map(function(a) { return +a; }))), 
            Math.log2(Math.max(...Object.values(setup.concentration).map(function(a) { return +a; })))
        ];

        for ( let y = -0.5; y <= -0.5; ++ y ) { // one direction 
            for ( let x = 0; x < numRecords; ++x ) {
                // the z value goes from (0-(numWells/2))/10 to ((numWells-1)-(numWells/2))/10 to cover the
                // range of all concentration units in setup.concentration ({A: ...})
                if (typeof(setup['function_fits'][x].type) !== 'undefined')
                    continue; // this is either Virus or Cell control, ignore for drawing
                // color based on R2
                var colorIdx = Math.max(0,Math.round(setup['function_fits'][x].R2 * 8));
                var mat = new THREE.MeshPhongMaterial( {
                    color: colorbrewer["RdYlGn"][9][colorIdx],
                    shininess: 10,
                    side: THREE.DoubleSide,
                    clipShadows: false// true
                } );
        
                var z = display_range[0] + ((setup['function_fits'][x].b - data_range[0])/(data_range[1] - data_range[0])*(display_range[1]-display_range[0])); // Math.pow(2, setup['function_fits'][x].b); // non-log units
                const mesh = new THREE.Mesh( geom, mat );
                mesh.position.set((x-(numRecords/2)) / 5 - 0, (+y), z );
                objectsInWorld.push({ 'type': "bar", 'val': setup['function_fits'][x].b, 'pos': mesh.position });
                mesh.scale.x = 0.1;
                object.add(mesh);

                // can we make the boxes more visible?
                const wireframe = new THREE.WireframeGeometry(geom);
                const line = new THREE.LineSegments( wireframe );
                line.material.depthTest = false;
                line.material.opacity = 0.25;
                line.material.transparent = true;
                
                line.material = new THREE.LineBasicMaterial({
                    color: 0xff0000,
                    depthTest: false,
                    opacity: 0.25,
                    transparent : true
                });
                line.position.set((x-(numRecords/2)) / 5 - 0, (+y), z );
                line.scale.x = 0.1;
                object.add(line);
            }
        }
    }
    
    scene.add( object );
}

let camera, scene, renderer, startTime, stats,

object, clipMaterial,
volumeVisualization,
globalClippingPlanes;

function init() {
    
    let FOV
    let FAR = 16
    let NEAR = 1
    
    // Mobile camera
    if (window.innerWidth <= 768) {
        FOV = 50
        FAR = 32
        // 769px - 1080px screen width camera
    } else if (window.innerWidth >= 769 && window.innerWidth <= 1080) {
        FOV = 50
        FAR = 16
        // > 1080px screen width res camera
    } else {
        FOV = 40
        FAR = 16
    }
    
    const container = document.getElementById('canvas'); // body;
    
    // camera = new THREE.PerspectiveCamera(FOV, jQuery(container).innerWidth() / jQuery(container).innerHeight(), NEAR, FAR );
    camera = new THREE.OrthographicCamera(
        jQuery(container).innerWidth() / -2, 
        jQuery(container).innerWidth() / 2, 
        jQuery(container).innerHeight() / 2, 
        jQuery(container).innerHeight() / -2);
    

    //camera.position.set( -2.93, 2.29, -4.83 );
    camera.position.set( 0,6,0);
    camera.zoom = 364.5737469464629;
    //camera.left = -570;
    //camera.right = 570;
    //camera.top = 250;
    //camera.bottom = -250;
    camera.quaternion.set(-0.7, 0, 0, 0.7);
    camera.updateProjectionMatrix();
    scene = new THREE.Scene();
    
    // Lights
    
    scene.add( new THREE.AmbientLight( 0xffffff, 0.3 ) );
    
    const spotLight = new THREE.SpotLight( 0xffffff, 0.5 );
    spotLight.angle = Math.PI / 5;
    spotLight.penumbra = 0.2;
    spotLight.position.set( -2, 3, -3 );
    spotLight.castShadow = true;
    spotLight.shadow.camera.near = 3;
    spotLight.shadow.camera.far = 10;
    spotLight.shadow.mapSize.width = 512;
    spotLight.shadow.mapSize.height = 512;
    scene.add( spotLight );
    
    const dirLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
    dirLight.position.set( 0, 2, 0 );
    dirLight.castShadow = true;
    dirLight.shadow.camera.near = 0.08;
    dirLight.shadow.camera.far = 11;
    
    dirLight.shadow.camera.right = 1;
    dirLight.shadow.camera.left = - 1;
    dirLight.shadow.camera.top	= 1;
    dirLight.shadow.camera.bottom = - 1;
    
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    scene.add( dirLight );
    
    // Geometry
    
    clipMaterial = new THREE.MeshPhongMaterial( {
        color: 0xee0a10,
        shininess: 50,
        side: THREE.DoubleSide,
        // Clipping setup:
        //clippingPlanes: createPlanes( Planes.length ),
        clipShadows: true
    } );
    
    object = new THREE.Group();
    
    const geometry = new THREE.BoxGeometry( 0.18, 0.18, 0.18 );
    
    /*for ( let z = -2; z <= 2; ++ z ) {
        for ( let y = - 2; y <= -2; ++ y ) {
            for ( let x = - 2; x <= 2; ++ x ) {
                
                const mesh = new THREE.Mesh( geometry, clipMaterial );
                mesh.position.set( x / 5, y / 5, z / 5 );
                mesh.castShadow = true;
                //object.add( mesh );
                
            }
        }
    }
    
    scene.add( object ); */
    
    
    const planeGeometry = new THREE.PlaneGeometry( 3, 3, 1, 1 ),
    
    color = new THREE.Color();
    
    //    volumeVisualization = new THREE.Group();
    //    volumeVisualization.visible = false;
    
    /*   for ( let i = 0, n = Planes.length; i !== n; ++ i ) {
        
        const material = new THREE.MeshBasicMaterial( {
            color: color.setHSL( i / n, 0.5, 0.5 ).getHex(),
            side: THREE.DoubleSide,
            
            opacity: 0.2,
            transparent: true,
            
            // no need to enable shadow clipping - the plane
            // visualization does not cast shadows
            
        } );
        
        const mesh = new THREE.Mesh( planeGeometry, material );
        mesh.matrixAutoUpdate = false;
        
        volumeVisualization.add( mesh );
        
    } */
    
    //    scene.add( volumeVisualization );
    
    
    const ground = new THREE.Mesh( planeGeometry, new THREE.MeshPhongMaterial( { color: 0xa0adaf, shininess: 10 } ) );
    ground.rotation.x = - Math.PI / 2;
    ground.scale.multiplyScalar( 3 );
    ground.receiveShadow = true;
    scene.add( ground );
    
    // Renderer
    
    let pixelRatio = window.devicePixelRatio
    let AA = true
    if (pixelRatio > 1) {
        AA = false
    }
    
    renderer = new THREE.WebGLRenderer({ 
        alpha: true,
        antialias: AA,
        powerPreference: "high-performance"
    });
    renderer.shadowMap.enabled = true;
    renderer.setClearColor( 0xffffff, 0);
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( jQuery(container).innerWidth(), jQuery(container).innerHeight() );
    window.addEventListener( 'resize', onWindowResize );
    container.appendChild( renderer.domElement );
    // Clipping setup:
    //globalClippingPlanes = createPlanes( GlobalClippingPlanes.length );
    renderer.clippingPlanes = Empty;
    renderer.localClippingEnabled = false;
    
    // Stats
    
    //stats = new Stats();
    //container.appendChild( stats.dom );
    
    // Controls
    
    const controls = new OrbitControls( camera, renderer.domElement );
    controls.minDistance = 1;
    controls.maxDistance = 8;
    controls.target.set( 0, 1, 0 );
    controls.update();
    
    // GUI
    
    /*        const gui = new GUI(),
    folder = gui.addFolder( "Local Clipping" ),
    props = {
        get 'Enabled'() {
            
            return renderer.localClippingEnabled;
            
        },
        set 'Enabled'( v ) {
            
            renderer.localClippingEnabled = v;
            if ( ! v ) volumeVisualization.visible = false;
            
        },
        
        get 'Shadows'() {
            
            return clipMaterial.clipShadows;
            
        },
        set 'Shadows'( v ) {
            
            clipMaterial.clipShadows = v;
            
        },
        
        get 'Visualize'() {
            
            return volumeVisualization.visible;
            
        },
        set 'Visualize'( v ) {
            
            if ( renderer.localClippingEnabled )
            volumeVisualization.visible = v;
            
        }
    };
    
    folder.add( props, 'Enabled' );
    folder.add( props, 'Shadows' );
    folder.add( props, 'Visualize' ).listen();
    
    gui.addFolder( "Global Clipping" ).
    add( {        get 'Enabled'() {
        
        return renderer.clippingPlanes !== Empty;
        
    },
    set 'Enabled'( v ) {
        
        renderer.clippingPlanes = v ?
        globalClippingPlanes : Empty;
        
    }
}, "Enabled" );
*/ 

// Start

startTime = Date.now();

}

function onWindowResize() {
    
    const container = document.getElementById('canvas'); // body;
    camera.aspect = jQuery(container).innerWidth() / jQuery(container).innerHeight();
    camera.updateProjectionMatrix();
    
    renderer.setSize( jQuery(container).innerWidth(), jQuery(container).innerHeight() );  
}

function setObjectWorldMatrix( object, matrix ) {
    
    // set the orientation of an object based on a world matrix
    
    const parent = object.parent;
    scene.updateMatrixWorld();
    object.matrix.copy( parent.matrixWorld ).invert();
    object.applyMatrix4( matrix );
    
}

const transform = new THREE.Matrix4(),
tmpMatrix = new THREE.Matrix4();

function animate() {
    
    const currentTime = Date.now(),
    time = ( currentTime - startTime ) / 1000;
    
    requestAnimationFrame( animate );
    
    object.position.y = 1.5;
    //object.rotation.x = time * 0.5;
    //object.rotation.y = time * 0.2;
    
    object.updateMatrix();
    transform.copy( object.matrix );
    renderer.render( scene, camera );
}
        
var firstTime = true;
var plate = null;
var plate2 = null;
export function setupPlotOnePlate( info, info2, setup ) {
    if (firstTime) {
        firstTime = false;
        init();
        animate();
    }
    // add the plate geometry
    plate = info;
    plate2 = info2;
    createPlateGeometry(info, info2, setup);
}
export function getObjectsInScene() {
    // return the x,y screen coordinates of all the objects in the scene
    var xys = [];
    for (var i = 0; i < objectsInWorld.length; i++) {
        var p = objectsInWorld[i].pos;
        var position = p.clone();
        camera.updateMatrixWorld();
        position.project(camera);
        var res = objectsInWorld[i].clone();
        res.pos = position;
        xys.push(res);
    }
    return xys;
}