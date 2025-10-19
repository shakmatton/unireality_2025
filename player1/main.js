
import {loadGLTF} from "./loader.js" 

const THREE = window.MINDAR.IMAGE.THREE

// Detecta se é dispositivo móvel
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

document.addEventListener("DOMContentLoaded", () => {

    const start = async() => {

        const mindarThree = new window.MINDAR.IMAGE.MindARThree({
            container: document.body,
            //imageTargetSrc: "./targets.mind"
            //imageTargetSrc: "./multi_detect.mind",
            //imageTargetSrc: "./lata_papel_2.mind"
            //imageTargetSrc: "./yellow_bin.mind"
            //imageTargetSrc: "./yellow_red_green_blue_bins.mind"
            //imageTargetSrc: "./yellow-red-green-blue&lata-garrafa-vidro-papel.mind"            
            imageTargetSrc: "./yellow-red-green-blue&lata-garrafa-vidro-papel-FINAL.mind" 

            //maxTrack: 2           // Melhor valor: 2-3                           
        })
    
        const {scene, camera, renderer} = mindarThree

        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1)      
        // light.intensity = 4.7                                                
        
        scene.add(light)

        // <=======================   GLTF LOADING   =========================>
        
        const yellow = await loadGLTF("./gltf/yellow.gltf")
        const red = await loadGLTF("./gltf/red.gltf")
        const green = await loadGLTF("./gltf/green.gltf")
        const blue = await loadGLTF("./gltf/blue.gltf")

        const lata = await loadGLTF("./gltf/3d_lata_3.gltf")       
        const garrafa = await loadGLTF("./gltf/3d_garrafa.gltf")                    // imagem base = 428,8 kB
        // const garrafa = await loadGLTF("./gltf/3d_garrafa_jpg_version.gltf")     // imagem base = 207,1 kB
        const vidro = await loadGLTF("./gltf/3d_vidro.gltf")
        const papel = await loadGLTF("./gltf/3d_papel_2_special.gltf")        

        // <====================   POSITION AND SCALE   ======================>

        yellow.scene.scale.set(0.85, 0.85, 0.85)
        yellow.scene.position.set(0, 0, 0)

        red.scene.scale.set(0.85, 0.85, 0.85)
        red.scene.position.set(0, 0, 0)

        green.scene.scale.set(0.85, 0.85, 0.85)
        green.scene.position.set(0, 0, 0)

        blue.scene.scale.set(0.85, 0.85, 0.85)
        blue.scene.position.set(0, 0, 0)

        lata.scene.scale.set(0.5, 0.5, 0.5)        
        lata.scene.position.set(0, 0, 0)

        garrafa.scene.scale.set(0.5, 0.5, 0.5)        
        garrafa.scene.position.set(0, 0, 0)

        vidro.scene.scale.set(0.5, 0.5, 0.5)        
        vidro.scene.position.set(0, 0, 0)

        papel.scene.scale.set(0.5, 0.5, 0.5)        
        papel.scene.position.set(0, 0, 0)

        // <=======================   ANCHORS   =========================>

        const yellowAnchor = mindarThree.addAnchor(0)
        yellowAnchor.group.add(yellow.scene) 

        const redAnchor = mindarThree.addAnchor(1)
        redAnchor.group.add(red.scene) 

        const greenAnchor = mindarThree.addAnchor(2)
        greenAnchor.group.add(green.scene) 

        const blueAnchor = mindarThree.addAnchor(3)
        blueAnchor.group.add(blue.scene) 

        const lataAnchor = mindarThree.addAnchor(4)
        lataAnchor.group.add(lata.scene)

        const garrafaAnchor = mindarThree.addAnchor(5)
        garrafaAnchor.group.add(garrafa.scene)

        const vidroAnchor = mindarThree.addAnchor(6)
        vidroAnchor.group.add(vidro.scene)
        
        const papelAnchor = mindarThree.addAnchor(7)
        papelAnchor.group.add(papel.scene)


        // <=======================   ANIMATION   =========================>


        const yellowMixer = new THREE.AnimationMixer(yellow.scene);
        const yellowAction = yellowMixer.clipAction(yellow.animations[1]);
        
        const redMixer = new THREE.AnimationMixer(red.scene);
        const redAction = redMixer.clipAction(red.animations[1]);

        const greenMixer = new THREE.AnimationMixer(green.scene);
        const greenAction = greenMixer.clipAction(green.animations[1]);

        const blueMixer = new THREE.AnimationMixer(blue.scene);
        const blueAction = blueMixer.clipAction(blue.animations[1]);

        const lataMixer = new THREE.AnimationMixer(lata.scene);
        const lataAction = lataMixer.clipAction(lata.animations[0]);
        
        const garrafaMixer = new THREE.AnimationMixer(garrafa.scene);
        const garrafaAction = garrafaMixer.clipAction(garrafa.animations[0]);

        const vidroMixer = new THREE.AnimationMixer(vidro.scene);
        const vidroAction = vidroMixer.clipAction(vidro.animations[0]);

        const papelMixer = new THREE.AnimationMixer(papel.scene);
        const papelAction = papelMixer.clipAction(papel.animations[0]);


        yellowAction.play();
        redAction.play();
        greenAction.play();
        blueAction.play();

        lataAction.play();
        garrafaAction.play();
        vidroAction.play();
        papelAction.play();

        
        // Botão Sair - posicionado no canto superior esquerdo
        const btnSair = document.createElement("img");
        btnSair.src = "gltf/imgs/sair.png";
        btnSair.alt = "Sair";
        btnSair.style.cursor = "pointer";
        btnSair.style.height = isMobile ? "40px" : "60px";
        btnSair.style.width = "auto";
        btnSair.style.position = "absolute";
        btnSair.style.top = "10px";
        btnSair.style.left = "10px";
        btnSair.addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.href = "https://shakmatton.github.io/unireality";
        });
        document.body.appendChild(btnSair);


        await mindarThree.start()

        const clock = new THREE.Clock();

        renderer.setAnimationLoop(() => {            
            
            const deltaTime = clock.getDelta();

            yellowMixer.update(deltaTime);
            redMixer.update(deltaTime);
            greenMixer.update(deltaTime);
            blueMixer.update(deltaTime);

            lataMixer.update(deltaTime);
            garrafaMixer.update(deltaTime);
            vidroMixer.update(deltaTime);
            papelMixer.update(deltaTime);

            renderer.render(scene, camera);
        });

            
            // Render techniques for improving lightning:
            // renderer.outputEncoding = THREE.LinearEncoding;
            // renderer.shadowMap.enabled = true;
            // renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            // renderer.physicallyCorrectLights = true; 

    }

    start()
    
})